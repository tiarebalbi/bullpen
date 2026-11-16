import { describe, expect, it } from "vitest";
import type { SweepTick } from "@bullpen/contracts";
import { EXIT_SOON_MS, openIsNear, run } from "./ticker.ts";

// SWEEPER_EXIT_WHEN_IDLE (ADR-0033): a run that is paid for by the minute leaves when there is nothing to do, and waits for an open that is near.
// The replies below have the shape the route sends: before the open a queue is not "open" work (open 0, queued above 0, nextOpen today), after it the queue is.
const NOW = new Date("2026-11-16T14:22:00Z"); // 9:22 ET on a Monday
const OPEN = "2026-11-16T14:30:00.000Z";
const TOMORROW = "2026-11-17T14:30:00.000Z";
const reply = (over: Partial<SweepTick>): SweepTick => ({ at: NOW.toISOString(), open: 0, flagged: 0, fills: 0, cancels: 0, placed: 0, cancelRequested: 0, released: 0, releaseFailed: 0, queued: 0, admitted: 0, toppedUp: 0, admissionRejected: 0, nextOpen: TOMORROW, errors: 0, ...over });
const answer = (over: Partial<SweepTick>) => () => Response.json(reply(over));

/** Runs the loop on a scripted sequence of replies with a clock that moves by what the loop sleeps; it stops by itself when the script runs out, so a loop that does not leave is a failed test. */
async function drive(script: (() => Response | Promise<Response>)[], options: { exitWhenIdle?: boolean } = { exitWhenIdle: true }) {
  const waits: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const controller = new AbortController();
  let index = 0;
  let clock = NOW.getTime();
  await run(
    {
      url: "http://sweep.test/api/internal/sweep",
      token: "SECRET-TOKEN",
      ...options,
      now: () => new Date(clock),
      fetch: (async () => script[index++]!()) as typeof fetch,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
        if (index >= script.length) controller.abort();
      },
      log: (line) => logs.push(line),
    },
    controller.signal,
  );
  return { waits, logs, calls: index };
}

describe("exit when idle", () => {
  it("leaves after one call when nothing is open and the next open is far off", async () => {
    const { waits, calls, logs } = await drive([answer({ open: 0, nextOpen: TOMORROW })]);
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
    expect(logs.at(-1)).toMatchObject({ outcome: "idle-exit" });
  });

  it("leaves on a holiday: the route's next open is the next trading day, so one call is all it makes", async () => {
    const { calls } = await drive([answer({ open: 0, nextOpen: "2026-11-27T14:30:00.000Z" })]);
    expect(calls).toBe(1);
  });

  it("leaves when the reply names no next open, since nothing is known to wait for", async () => {
    const { calls } = await drive([() => Response.json({ open: 0 })]);
    expect(calls).toBe(1);
  });

  it("waits for an open that is near, sweeps at it, keeps sweeping while orders are open, and leaves on the first idle reply after it", async () => {
    // 9:22: an empty reply, with a queue that is not open work yet and an open 8 minutes away. Then the open. Then the queue is open work until it is drained.
    const { waits, calls, logs } = await drive([
      answer({ open: 0, queued: 250, nextOpen: OPEN }),
      answer({ open: 250, queued: 150, admitted: 100, nextOpen: TOMORROW }),
      answer({ open: 150, queued: 50, admitted: 100, nextOpen: TOMORROW }),
      answer({ open: 50, queued: 0, admitted: 50, nextOpen: TOMORROW }),
      answer({ open: 0, queued: 0, nextOpen: TOMORROW }),
    ]);
    expect(calls).toBe(5);
    expect(waits).toHaveLength(4); // a sleep after each call but the last
    expect(waits[0]).toBeGreaterThan(0); // an empty reply before the open: it sleeps (the idle backoff, cut short to land on the open) and calls again
    expect(waits.slice(1)).toEqual([5000, 5000, 5000]); // 5 s between passes while the queue drains
    expect(logs.at(-1)).toMatchObject({ outcome: "idle-exit" });
  });

  it("with only queued orders it does not leave before the open, however many empty replies the wait takes", async () => {
    const { calls } = await drive([answer({ open: 0, queued: 3, nextOpen: OPEN }), answer({ open: 0, queued: 3, nextOpen: OPEN }), answer({ open: 0, queued: 3, nextOpen: OPEN }), answer({ open: 0, queued: 3, nextOpen: OPEN })]);
    expect(calls).toBe(4); // the script ran out, which aborts the loop; it never chose to leave
  });

  it("keeps sweeping every 5 seconds while orders are open, and does not leave on a reply that has some", async () => {
    const { waits, calls } = await drive([answer({ open: 3 }), answer({ open: 1 }), answer({ open: 2 })]);
    expect(waits).toEqual([5000, 5000, 5000]);
    expect(calls).toBe(3);
  });

  it("does not leave on a failure, whatever kind: it backs off and retries until the job's own time limit", async () => {
    const { waits, calls, logs } = await drive([
      () => new Response("no", { status: 500 }),
      () => new Response("no", { status: 401 }),
      () => Response.json({ nothing: true }),
      () => new Response("not json", { status: 200 }),
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    expect(calls).toBe(5);
    expect(waits).toEqual([10000, 20000, 40000, 80000, 160000]);
    expect(logs.some((l) => l.outcome === "idle-exit")).toBe(false);
  });

  it("recovers from a failure and then leaves when it is idle", async () => {
    const { calls } = await drive([() => new Response("no", { status: 503 }), answer({ open: 0, nextOpen: TOMORROW })]);
    expect(calls).toBe(2);
  });

  it("is off unless asked: an idle reply does not end the loop", async () => {
    const { waits, calls } = await drive([answer({ open: 0 }), answer({ open: 0 })], {});
    expect(calls).toBe(2);
    expect(waits).toEqual([10000, 20000]);
  });
});

describe("openIsNear", () => {
  it("is near inside 15 minutes, not at or beyond it, and an open that is due counts as near", () => {
    expect(EXIT_SOON_MS).toBe(15 * 60_000);
    expect(openIsNear(new Date(NOW.getTime() + 8 * 60_000), NOW)).toBe(true);
    expect(openIsNear(new Date(NOW.getTime() + 15 * 60_000 - 1), NOW)).toBe(true);
    expect(openIsNear(new Date(NOW.getTime() + 15 * 60_000), NOW)).toBe(false);
    expect(openIsNear(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
    expect(openIsNear(null, NOW)).toBe(false);
  });
});
