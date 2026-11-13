import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import { BACKOFF_MAX_MS, POLL_AFTER_FAILURES, POLL_MS, PLANNED_RECONNECT_JITTER_MS, PriceLink, RETRY_WHILE_POLLING_MS, STALE_AFTER_MS, STREAM_URL, backoffMs, type LinkDeps, type LinkState, type PollResult, type StreamLike } from "./priceLink.js";

const row = (price: string, stale = false): StockPriceSnapshot["rows"][number] => ({ symbol: "AAPL", price, asOf: "2026-11-12T21:00:00.000Z", stale, previousClose: null });
const snap = (price = "100.00000000", stale = false): StockPriceSnapshot => ({ rows: [row(price, stale)] });

class FakeStream implements StreamLike {
  listeners = new Map<string, (event: { data?: string; lastEventId?: string }) => void>();
  closed = false;
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: { data?: string; lastEventId?: string }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, event: { data?: string; lastEventId?: string } = {}): void {
    this.listeners.get(type)?.(event);
  }
  prices(snapshot: StockPriceSnapshot, id: string): void {
    this.emit("prices", { data: JSON.stringify({ ...snapshot, servedAt: Date.now() }), lastEventId: id });
  }
}

function setup(options: { random?: number; stream?: boolean; poll?: () => Promise<PollResult> } = {}) {
  const streams: FakeStream[] = [];
  const states: LinkState[] = [];
  const poll = vi.fn(options.poll ?? (async (): Promise<PollResult> => ({ snapshot: snap("101.00000000") })));
  const deps: LinkDeps = {
    openStream: options.stream === false ? null : (url) => { const s = new FakeStream(url); streams.push(s); return s; },
    fetchSnapshot: poll,
    now: () => Date.now(),
    random: () => options.random ?? 0.5,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const link = new PriceLink(deps, (state) => states.push(state));
  return { link, streams, states, poll, last: () => states[states.length - 1]! };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Live, Reconnecting and Stale", () => {
  it("is Reconnecting until the first frame, Live once prices arrive, and shows them", () => {
    const { link, streams, last } = setup();
    link.start();
    expect(link.current.status).toBe("reconnecting");
    streams[0]!.prices(snap(), "1.1.0");
    expect(last()).toMatchObject({ status: "live", via: "stream", snapshot: snap() });
  });

  it("records when the feed last spoke, so the indicator can say how fresh it is", async () => {
    const { link, streams, last } = setup();
    link.start();
    expect(last()?.lastFrameAt ?? null).toBeNull();
    streams[0]!.prices(snap(), "1.1.0");
    const first = last().lastFrameAt;
    expect(first).toBe(Date.now());
    await vi.advanceTimersByTimeAsync(3000);
    streams[0]!.emit("tick");
    expect(last().lastFrameAt).toBe(first! + 3000);
  });

  it("is Stale when a price is older than its kind allows: the price contract's flag, not the client's clock", () => {
    const { link, streams, last } = setup();
    link.start();
    streams[0]!.prices(snap("100.00000000", true), "1.1.1");
    expect(last().status).toBe("stale");
    streams[0]!.prices(snap("100.00000000", false), "2.1.0");
    expect(last().status).toBe("live");
  });

  it("is Stale when the stream goes quiet for longer than three ticks, and Live again at the next tick", async () => {
    const { link, streams, last } = setup();
    link.start();
    streams[0]!.prices(snap(), "1.1.0");
    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS + 6_000);
    expect(last().status).toBe("stale");
    streams[0]!.emit("tick");
    expect(last().status).toBe("live");
  });

  it("is Reconnecting while the stream is down, keeping the last prices on screen", () => {
    const { link, streams, last } = setup();
    link.start();
    streams[0]!.prices(snap(), "1.1.0");
    streams[0]!.emit("error");
    expect(last()).toMatchObject({ status: "reconnecting", snapshot: snap() });
  });
});

describe("reconnect and resume", () => {
  it("reconnects after a failure with a jittered, growing backoff, and the delay is never past the cap", async () => {
    const { link, streams } = setup({ random: 0.999 });
    link.start();
    streams[0]!.emit("error");
    expect(streams[0]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(backoffMs(1, () => 0.999) - 1);
    expect(streams).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(streams).toHaveLength(2);
    expect(backoffMs(1, () => 0.999)).toBeLessThan(backoffMs(2, () => 0.999));
    expect(backoffMs(40, () => 0.999)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    expect(backoffMs(3, () => 0)).toBe(0); // full jitter: a crowd spreads over the whole window
  });

  it("resumes from the last event id it holds on every reconnect", async () => {
    const { link, streams } = setup({ random: 0 });
    link.start();
    expect(streams[0]!.url).toBe(STREAM_URL);
    streams[0]!.prices(snap(), "1700000000000.1.0");
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(10);
    expect(streams[1]!.url).toBe(`${STREAM_URL}?lastEventId=1700000000000.1.0`);
  });

  it("at the server's planned close (the 300 s cut) reconnects after a short jitter, without counting a failure or polling", async () => {
    const { link, streams, poll } = setup({ random: 0.5 });
    link.start();
    for (let i = 0; i < 6; i += 1) {
      streams[i]!.prices(snap(), `${i}.1.0`);
      streams[i]!.emit("bye");
      await vi.advanceTimersByTimeAsync(PLANNED_RECONNECT_JITTER_MS);
    }
    expect(streams).toHaveLength(7);
    expect(poll).not.toHaveBeenCalled();
    expect(streams[6]!.url).toContain("lastEventId=5.1.0");
  });

  it("a frame resets the failure count, so isolated failures never add up to polling", async () => {
    const { link, streams, poll } = setup({ random: 0 });
    link.start();
    streams[0]!.prices(snap(), "0.1.0");
    for (let i = 0; i < POLL_AFTER_FAILURES * 2; i += 1) {
      streams[i]!.emit("error");
      await vi.advanceTimersByTimeAsync(10);
      streams[i + 1]!.prices(snap(), `${i}.1.0`);
    }
    expect(poll).not.toHaveBeenCalled();
  });
});

describe("polling is the fallback", () => {
  it("treats the server's 'unavailable' (an open stream with no prices) as a failure: closes it, polls at once, retries later", async () => {
    const { link, streams, poll, last } = setup({ random: 0.9 });
    link.start();
    streams[0]!.emit("unavailable");
    await vi.advanceTimersByTimeAsync(0);
    expect(streams[0]!.closed).toBe(true);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ via: "polling", snapshot: snap("101.00000000") });
    await vi.advanceTimersByTimeAsync(RETRY_WHILE_POLLING_MS);
    expect(streams.length).toBeGreaterThanOrEqual(2);
  });

  it("with nothing on screen, polls at the first failure instead of making the player wait through the backoff", async () => {
    const { link, streams, poll, last } = setup({ random: 0.9 });
    link.start();
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ via: "polling", snapshot: snap("101.00000000") });
  });

  it("with prices on screen, keeps them and retries the stream first: three failures in a row before polling", async () => {
    const { link, streams, poll } = setup({ random: 0 });
    link.start();
    streams[0]!.prices(snap(), "1.1.0");
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(5);
    streams[1]!.emit("error");
    await vi.advanceTimersByTimeAsync(5);
    expect(poll).not.toHaveBeenCalled();
    streams[2]!.emit("error");
    await vi.advanceTimersByTimeAsync(5);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("after three failures in a row polls /api/stock-prices every 10 s, keeps trying the stream once a minute, and is Live from the poll", async () => {
    const { link, streams, poll, last } = setup({ random: 0 });
    link.start();
    streams[0]!.prices(snap(), "1.1.0");
    for (let i = 0; i < POLL_AFTER_FAILURES; i += 1) {
      streams[i]!.emit("error");
      await vi.advanceTimersByTimeAsync(5);
    }
    expect(poll).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ via: "polling", status: "live", snapshot: snap("101.00000000") });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(poll.mock.calls.length).toBeGreaterThanOrEqual(4);
    const before = streams.length;
    await vi.advanceTimersByTimeAsync(RETRY_WHILE_POLLING_MS);
    expect(streams.length).toBe(before + 1);
  });

  it("stops polling the moment the stream is back", async () => {
    const { link, streams, poll, last } = setup({ random: 0 });
    link.start();
    streams[0]!.prices(snap(), "1.1.0");
    for (let i = 0; i < POLL_AFTER_FAILURES; i += 1) {
      streams[i]!.emit("error");
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(RETRY_WHILE_POLLING_MS);
    streams[streams.length - 1]!.prices(snap("102.00000000"), "9.1.0");
    expect(last()).toMatchObject({ via: "stream", status: "live", snapshot: snap("102.00000000") });
    const calls = poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(poll.mock.calls.length).toBe(calls);
  });

  it("with no event streams in the browser, polls from the start", async () => {
    const { link, poll, last } = setup({ stream: false });
    link.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ via: "polling", snapshot: snap("101.00000000") });
  });

  it("says 'failed' when the poll fails and there is nothing to show, and keeps old prices when it fails later", async () => {
    let fail = true;
    const { link, last } = setup({ stream: false, poll: async (): Promise<PollResult> => (fail ? { httpStatus: 503 } : { snapshot: snap("103.00000000") }) });
    link.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({ failed: { httpStatus: 503 }, snapshot: null });
    fail = false;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(last()).toMatchObject({ failed: null, snapshot: snap("103.00000000") });
    fail = true;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(last().snapshot).toEqual(snap("103.00000000"));
  });

  it("falls back at once when the price-stream switch is off and the stream answers 503, which an event stream reports as an error", async () => {
    const { link, streams, poll, last } = setup({ random: 0 });
    link.start();
    streams[0]!.emit("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(last().snapshot).toEqual(snap("101.00000000"));
  });
});

describe("stop", () => {
  it("closes the stream and clears every timer, so an unmounted screen leaves nothing running", async () => {
    const { link, streams, poll } = setup({ random: 0 });
    link.start();
    streams[0]!.prices(snap(), "0.1.0");
    streams[0]!.emit("error");
    link.stop();
    await vi.advanceTimersByTimeAsync(RETRY_WHILE_POLLING_MS * 3);
    expect(streams).toHaveLength(1);
    expect(poll).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
