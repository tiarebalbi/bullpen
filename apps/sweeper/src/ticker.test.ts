import { describe, expect, it } from "vitest";
import { validateSweepTick, type SweepTick } from "@bullpen/contracts";
import { OPEN_MARGIN_MS, nextWait, run, sleepFor } from "./ticker.ts";

const reply = (open: number): SweepTick => ({ at: "2026-10-20T12:00:00.000Z", open, flagged: 0, fills: 0, cancels: 0, placed: 0, cancelRequested: 0, released: 0, releaseFailed: 0, queued: 0, admitted: 0, toppedUp: 0, admissionRejected: 0, nextOpen: "2026-10-21T13:30:00.000Z", errors: 0 });

/** Drives the loop with a scripted sequence of replies and a sleep that records the wait and aborts after `calls` calls. */
async function drive(script: (() => Response | Promise<Response>)[], options: { activeMs?: number; maxMs?: number } = {}) {
  const waits: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const controller = new AbortController();
  let index = 0;
  await run(
    {
      url: "http://sweep.test/api/internal/sweep",
      token: "SECRET-TOKEN",
      ...options,
      fetch: (async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        return script[index++]!();
      }) as typeof fetch,
      sleep: async (ms) => {
        waits.push(ms);
        if (index >= script.length) controller.abort();
      },
      log: (line) => logs.push(line),
    },
    controller.signal,
  );
  return { waits, logs, requests };
}
const ok = (open: number) => () => Response.json(reply(open));

describe("the sweeper's cadence", () => {
  it("ticks every 5 seconds while orders are open", async () => {
    const { waits } = await drive([ok(3), ok(1), ok(2)]);
    expect(waits).toEqual([5000, 5000, 5000]);
  });

  it("backs off, doubling to 60 minutes, when none are open, and returns to 5 seconds when one appears", async () => {
    const { waits } = await drive([ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(2), ok(0)]);
    expect(waits).toEqual([10000, 20000, 40000, 80000, 160000, 320000, 640000, 1280000, 2560000, 3600000, 3600000, 5000, 10000]);
  });

  it("backs off after failures too, whatever kind, and never stops", async () => {
    const { waits, logs } = await drive([
      () => new Response("no", { status: 500 }),
      () => new Response("no", { status: 401 }),
      () => Response.json({ nothing: true }),
      () => new Response("not json", { status: 200 }),
      () => {
        throw new TypeError("fetch failed");
      },
      ok(1),
    ]);
    expect(waits).toEqual([10000, 20000, 40000, 80000, 160000, 5000]);
    expect(logs.filter((l) => l.outcome === "failed")).toHaveLength(5);
  });

  it("sends the token as a bearer token to the given URL, as a POST, and never logs it", async () => {
    const { requests, logs } = await drive([ok(1), () => new Response("no", { status: 401 })]);
    expect(requests[0]!.url).toBe("http://sweep.test/api/internal/sweep");
    expect(requests[0]!.init).toMatchObject({ method: "POST", headers: { authorization: "Bearer SECRET-TOKEN" } });
    expect(JSON.stringify(logs)).not.toContain("SECRET-TOKEN");
  });

  it("logs a change of state, not every quiet tick", async () => {
    const { logs } = await drive([ok(0), ok(0), ok(0), ok(0), ok(1), ok(1)]);
    expect(logs.map((l) => l.outcome)).toEqual(["idle", "open"]);
  });

  it("leaves at once when the signal aborts during a call, without logging a failure", async () => {
    const controller = new AbortController();
    const logs: unknown[] = [];
    const finished = run(
      {
        url: "http://x",
        token: "t",
        log: (l) => logs.push(l),
        fetch: ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch,
      },
      controller.signal,
    );
    controller.abort();
    await finished;
    expect(logs).toEqual([]);
  });

  it("nextWait: open resets, idle and failure double from twice the active wait, up to the maximum", () => {
    expect(nextWait(3600000, "open")).toBe(5000);
    expect(nextWait(5000, "idle")).toBe(10000);
    expect(nextWait(400000, "failed")).toBe(300000);
    expect(nextWait(3600000, "idle")).toBe(3600000);
    expect(nextWait(2000000, "idle")).toBe(3600000);
  });
});

describe("the reply the sweeper reads", () => {
  it("is a reply the contract accepts: the field it needs is in the contract", () => {
    expect(validateSweepTick(reply(4))).toEqual({ valid: true, errors: null });
  });
});

describe("the sweeper is awake for the open (ADR-0028)", () => {
  const open = new Date("2026-11-16T14:30:00Z"); // Monday 9:30 ET
  const tenBefore = new Date("2026-11-16T14:20:00Z");

  it("keeps its backoff while the open is far off, or not known", () => {
    expect(sleepFor(3_600_000, new Date("2026-11-13T23:00:00Z"), open)).toBe(3_600_000);
    expect(sleepFor(3_600_000, tenBefore, null)).toBe(3_600_000);
  });

  it("cuts a long sleep short so the call lands just after 9:30 ET, even after the 60-minute backoff", () => {
    expect(sleepFor(3_600_000, tenBefore, open)).toBe(10 * 60_000 + OPEN_MARGIN_MS);
    expect(new Date(tenBefore.getTime() + sleepFor(3_600_000, tenBefore, open)).toISOString()).toBe("2026-11-16T14:30:00.500Z");
  });

  it("never wakes before the open: the margin is on the late side", () => {
    expect(sleepFor(3_600_000, new Date("2026-11-16T14:29:59.900Z"), open)).toBe(100 + OPEN_MARGIN_MS);
  });

  it("ignores an open that has already passed", () => {
    expect(sleepFor(60_000, new Date("2026-11-16T14:31:00Z"), open)).toBe(60_000);
  });

  /** Drives the loop with replies that name the next open, and a clock that stays where the test puts it. */
  async function driveAt(now: Date, replies: Response[]): Promise<number[]> {
    const waits: number[] = [];
    const controller = new AbortController();
    let index = 0;
    await run(
      {
        url: "http://sweep.test/api/internal/sweep",
        token: "T",
        fetch: (async () => replies[index++]!.clone()) as typeof fetch,
        now: () => now,
        sleep: async (ms) => {
          waits.push(ms);
          if (index >= replies.length) controller.abort();
        },
        log: () => {},
      },
      controller.signal,
    );
    return waits;
  }

  it("the loop sleeps to the open once the route has named it, and its backoff was not shortened by the cut", async () => {
    const same = Response.json({ ...reply(0), nextOpen: open.toISOString() });
    const waits = await driveAt(tenBefore, Array.from({ length: 12 }, () => same));
    // The first call is answered before any open is known; from then on every wait longer than ten minutes is cut to the open.
    expect(waits.slice(0, 6)).toEqual([10000, 20000, 40000, 80000, 160000, 320000]);
    expect(waits.slice(6)).toEqual(Array(6).fill(10 * 60_000 + OPEN_MARGIN_MS));
  });

  it("keeps the open it was told through a failed call", async () => {
    const waits = await driveAt(tenBefore, [Response.json({ ...reply(0), nextOpen: open.toISOString() }), new Response("no", { status: 500 }), new Response("no", { status: 500 })]);
    expect(waits.length).toBe(3);
    expect(waits.every((ms) => ms <= 10 * 60_000 + OPEN_MARGIN_MS)).toBe(true);
  });

  it("works with a reply that names no open: the backoff alone", async () => {
    const bare: Partial<SweepTick> = reply(0);
    delete bare.nextOpen;
    const waits = await driveAt(tenBefore, [Response.json(bare), Response.json(bare)]);
    expect(waits).toEqual([10000, 20000]);
  });
});
