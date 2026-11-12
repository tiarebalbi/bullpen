import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import { HUB_INTERVAL_MS, PriceHub, frameId } from "./priceHub.js";
import { HOBBY_MAX_DURATION_MS, STREAM_BASE_MS, STREAM_JITTER_MS, lifetimeMs, openPriceStream } from "./priceStream.js";

type Row = StockPriceSnapshot["rows"][number];
const row = (symbol: string, price: string, asOf: string, stale = false): Row => ({ symbol, price, asOf, stale, previousClose: null });
const snap = (...rows: Row[]): StockPriceSnapshot => ({ rows });
const A = snap(row("AAPL", "100.00000000", "2026-11-12T21:00:00.000Z"), row("MSFT", "200.00000000", "2026-11-12T21:00:00.000Z"));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A hub over a read that counts itself, on fake time. */
function hubOf(read: () => Promise<StockPriceSnapshot>) {
  const counted = vi.fn(read);
  return { hub: new PriceHub({ read: counted, now: () => Date.now() }), reads: counted };
}
const sink = () => {
  const chunks: string[] = [];
  return { chunks, write: (chunk: string) => void chunks.push(chunk), text: () => chunks.join("") };
};
const events = (text: string, name: string): string[] => text.split("\n\n").filter((block) => block.includes(`event: ${name}`));

describe("fan-out on one instance", () => {
  it("reads the shared data once for a thousand clients who connect together, and sends every one of them the prices", async () => {
    const { hub, reads } = hubOf(async () => A);
    const sinks = Array.from({ length: 1000 }, sink);
    for (const s of sinks) hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(hub.reads).toBe(1);
    expect(hub.clients).toBe(1000);
    expect(hub.peakClients).toBe(1000);
    for (const s of sinks) expect(events(s.text(), "prices")).toHaveLength(1);
  });

  it("makes one read per interval however many clients are connected, and pushes it to all of them", async () => {
    let n = 0;
    const { hub, reads } = hubOf(async () => snap(row("AAPL", String(100 + n++), `2026-11-12T21:00:0${Math.min(n, 9)}.000Z`)));
    const sinks = Array.from({ length: 500 }, sink);
    for (const s of sinks) hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 4);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(1 + 4);
    expect(reads.mock.calls.length).toBeGreaterThanOrEqual(4);
    for (const s of sinks) expect(events(s.text(), "prices").length).toBeGreaterThanOrEqual(4);
  });

  it("coalesces reads that overlap: clients arriving while a slow read is in flight share it", async () => {
    let release: (value: StockPriceSnapshot) => void = () => undefined;
    const { hub, reads } = hubOf(() => new Promise<StockPriceSnapshot>((resolve) => (release = resolve)));
    const sinks = Array.from({ length: 50 }, sink);
    for (const s of sinks) hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(2000);
    for (const s of sinks.slice(0, 5)) expect(events(s.text(), "prices")).toHaveLength(0);
    release(A);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(1);
    for (const s of sinks) expect(events(s.text(), "prices")).toHaveLength(1);
  });

  it("shares a read made a moment ago with a client who connects now, and reads again only when it is older than an interval", async () => {
    const { hub, reads } = hubOf(async () => A);
    hub.subscribe(sink().write);
    await vi.advanceTimersByTimeAsync(100);
    hub.subscribe(sink().write);
    await vi.advanceTimersByTimeAsync(100);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it("starts its interval with the first client and stops it with the last: an instance with no viewers reads nothing", async () => {
    const { hub, reads } = hubOf(async () => A);
    const off = [hub.subscribe(sink().write), hub.subscribe(sink().write)];
    await vi.advanceTimersByTimeAsync(0);
    off[0]!();
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 2);
    const whileOne = reads.mock.calls.length;
    expect(whileOne).toBeGreaterThanOrEqual(2);
    off[1]!();
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 10);
    expect(reads).toHaveBeenCalledTimes(whileOne);
    expect(hub.clients).toBe(0);
  });

  it("drops a client whose write throws, and carries on with the rest", async () => {
    const { hub } = hubOf(async () => A);
    const good = sink();
    let alive = true;
    hub.subscribe(good.write);
    hub.subscribe(() => {
      if (!alive) throw new Error("closed");
    });
    await vi.advanceTimersByTimeAsync(0);
    alive = false;
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS);
    expect(hub.clients).toBe(1);
    expect(good.text()).toContain("event: tick");
  });
});

describe("reconnect and resume", () => {
  it("sends a client the prices on a first connection and tells it how long to wait before reconnecting", async () => {
    const { hub } = hubOf(async () => A);
    const s = sink();
    hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.text()).toContain("retry: 3000");
    expect(s.text()).toContain(`id: ${frameId(A)}`);
  });

  it("resumes from Last-Event-ID: a client that already holds the current prices is sent a tick, not the prices again", async () => {
    const { hub } = hubOf(async () => A);
    const s = sink();
    hub.subscribe(s.write, frameId(A));
    await vi.advanceTimersByTimeAsync(0);
    expect(events(s.text(), "prices")).toHaveLength(0);
    expect(events(s.text(), "tick")).toHaveLength(1);
  });

  it("sends the new prices to a client whose Last-Event-ID is out of date", async () => {
    const { hub } = hubOf(async () => A);
    const s = sink();
    hub.subscribe(s.write, "1.1.0");
    await vi.advanceTimersByTimeAsync(0);
    expect(events(s.text(), "prices")).toHaveLength(1);
  });

  it("changes its id when a price changes, when a symbol appears and when a price turns stale, and not otherwise", () => {
    const base = frameId(A);
    expect(frameId(snap(...A.rows))).toBe(base);
    expect(frameId(snap(row("AAPL", "100.00000000", "2026-11-13T21:00:00.000Z"), A.rows[1]!))).not.toBe(base);
    expect(frameId(snap(...A.rows, row("NVDA", "1", "2026-11-12T21:00:00.000Z")))).not.toBe(base);
    expect(frameId(snap({ ...A.rows[0]!, stale: true }, A.rows[1]!))).not.toBe(base);
  });

  it("tells a client the stream has no prices when the first read fails, instead of ticking as if all were well", async () => {
    const hub = new PriceHub({ read: async () => { throw new Error("db down"); }, now: () => Date.now() });
    const s = sink();
    hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 2);
    expect(events(s.text(), "unavailable").length).toBeGreaterThanOrEqual(2);
    expect(events(s.text(), "prices")).toHaveLength(0);
    expect(events(s.text(), "tick")).toHaveLength(0);
  });

  it("ticks when nothing changed, so a client can tell a quiet stream from a dead one", async () => {
    const { hub } = hubOf(async () => A);
    const s = sink();
    hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 3);
    expect(events(s.text(), "prices")).toHaveLength(1);
    expect(events(s.text(), "tick").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the last prices when a read fails, counts the failure, and recovers on the next interval", async () => {
    let fail = false;
    const errors: unknown[] = [];
    const hub = new PriceHub({ read: async () => { if (fail) throw new Error("db down"); return A; }, now: () => Date.now(), onError: (e) => errors.push(e) });
    const s = sink();
    hub.subscribe(s.write);
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 2);
    expect(hub.readFailures).toBeGreaterThanOrEqual(1);
    expect(errors.length).toBe(hub.readFailures);
    expect(hub.latest?.id).toBe(frameId(A));
    fail = false;
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS);
    expect(hub.readFailures).toBeLessThan(hub.reads);
  });
});

describe("the 300 s cut", () => {
  it("ends every connection between 240 s and 270 s, before Hobby's 300 s limit, whatever the jitter", () => {
    for (const r of [0, 0.25, 0.5, 0.999999]) {
      const ms = lifetimeMs(() => r);
      expect(ms).toBeGreaterThanOrEqual(STREAM_BASE_MS);
      expect(ms).toBeLessThan(STREAM_BASE_MS + STREAM_JITTER_MS);
      expect(ms).toBeLessThan(HOBBY_MAX_DURATION_MS);
    }
  });

  it("sends a bye event and closes the stream when its lifetime is up, and frees its place in the hub", async () => {
    const { hub } = hubOf(async () => A);
    const stream = openPriceStream(hub, { random: () => 0 });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const drain = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        text += decoder.decode(value);
      }
    })();
    await vi.advanceTimersByTimeAsync(STREAM_BASE_MS - 1);
    expect(hub.clients).toBe(1);
    expect(text).not.toContain("event: bye");
    await vi.advanceTimersByTimeAsync(2);
    await drain;
    expect(text).toContain("event: bye");
    expect(hub.clients).toBe(0);
  });

  it("frees its place when the client goes away, and reads nothing for a stream nobody holds", async () => {
    const { hub, reads } = hubOf(async () => A);
    const controller = new AbortController();
    openPriceStream(hub, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.clients).toBe(1);
    controller.abort();
    expect(hub.clients).toBe(0);
    const before = reads.mock.calls.length;
    await vi.advanceTimersByTimeAsync(HUB_INTERVAL_MS * 5);
    expect(reads).toHaveBeenCalledTimes(before);
  });

  it("passes Last-Event-ID through, so a reconnect after the cut is sent a tick when nothing changed", async () => {
    const { hub } = hubOf(async () => A);
    const reader = openPriceStream(hub, { lastEventId: frameId(A) }).getReader();
    await vi.advanceTimersByTimeAsync(10);
    const chunks: string[] = [];
    for (let i = 0; i < 2; i += 1) chunks.push(new TextDecoder().decode((await reader.read()).value));
    expect(chunks.join("")).toContain("event: tick");
    expect(chunks.join("")).not.toContain("event: prices");
    await reader.cancel();
  });
});
