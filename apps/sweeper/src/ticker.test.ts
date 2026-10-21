import { describe, expect, it } from "vitest";
import { validateSweepTick, type SweepTick } from "@bullpen/contracts";
import { nextWait, run } from "./ticker.ts";

const reply = (open: number): SweepTick => ({ at: "2026-10-20T12:00:00.000Z", open, flagged: 0, fills: 0, cancels: 0, placed: 0, cancelRequested: 0, released: 0, releaseFailed: 0, errors: 0 });

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

  it("backs off, doubling to 15 minutes, when none are open, and returns to 5 seconds when one appears", async () => {
    const { waits } = await drive([ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(0), ok(2), ok(0)]);
    expect(waits).toEqual([10000, 20000, 40000, 80000, 160000, 320000, 640000, 900000, 900000, 5000, 10000]);
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
    expect(nextWait(900000, "open")).toBe(5000);
    expect(nextWait(5000, "idle")).toBe(10000);
    expect(nextWait(400000, "failed")).toBe(300000);
    expect(nextWait(900000, "idle")).toBe(900000);
    expect(nextWait(500000, "idle")).toBe(900000);
  });
});

describe("the reply the sweeper reads", () => {
  it("is a reply the contract accepts: the field it needs is in the contract", () => {
    expect(validateSweepTick(reply(4))).toEqual({ valid: true, errors: null });
  });
});
