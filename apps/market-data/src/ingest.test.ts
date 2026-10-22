import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { CALL_SPACING_MS, isAuthorized, runStockIngest, type IngestDeps } from "./ingest.js";

const pool = {} as Pool;
// 19:30 in New York on Tuesday 2026-10-13: after the close, inside the cron's window.
const TUESDAY_EVENING = new Date("2026-10-13T23:30:00Z");
const SATURDAY = new Date("2026-10-17T23:30:00Z");
const THANKSGIVING = new Date("2026-11-26T23:30:00Z");

const quoteFor = (symbol: string, day: string) => ({ ok: true, status: 200, json: async () => ({ "Global Quote": { "01. symbol": symbol, "05. price": "100.5", "07. latest trading day": day } }) });

function harness(overrides: Partial<IngestDeps> & { held?: Set<string>; day?: string; grants?: number } = {}) {
  const calls: string[] = [];
  const stored: Array<{ symbol: string; asOf: string; validUntil: string; price: string; kind: string | undefined }> = [];
  const slept: number[] = [];
  const logs: string[] = [];
  let reservations = 0;
  const deps: IngestDeps = {
    pool,
    apiKey: "key",
    now: TUESDAY_EVENING,
    symbols: ["AAPL", "MSFT", "NVDA"],
    fetchFn: async (url) => {
      const symbol = new URL(url).searchParams.get("symbol")!;
      calls.push(symbol);
      return quoteFor(symbol, overrides.day ?? "2026-10-13");
    },
    sleep: async (ms) => void slept.push(ms),
    log: { warn: (m) => void logs.push(m), info: (m) => void logs.push(m) },
    seams: {
      has: async (_pool, symbol) => overrides.held?.has(symbol) ?? false,
      store: async (_pool, quote) => {
        stored.push({ symbol: quote.symbol, asOf: quote.asOf.toISOString(), validUntil: quote.validUntil.toISOString(), price: quote.price, kind: quote.kind });
        return true;
      },
      reserve: async () => {
        reservations += 1;
        const granted = reservations <= (overrides.grants ?? 99);
        return { granted, calls: reservations, cap: 20 };
      },
    },
    ...overrides,
  };
  return { deps, calls, stored, slept, logs };
}

describe("runStockIngest", () => {
  it("prices each symbol once, at the day's close, valid through the next trading day", async () => {
    const h = harness();
    const summary = await runStockIngest(h.deps);

    expect(summary).toMatchObject({ date: "2026-10-13", skipped: null, stored: ["AAPL", "MSFT", "NVDA"], refused: false, failed: [] });
    expect(h.calls).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(h.stored[0]).toEqual({ symbol: "AAPL", asOf: "2026-10-13T20:00:00.000Z", validUntil: "2026-10-15T03:59:59.000Z", price: "100.5", kind: "end-of-day" });
  });

  it("spaces its calls: no wait before the first, 12 seconds between the rest", async () => {
    const h = harness();
    await runStockIngest(h.deps);
    expect(h.slept).toEqual([CALL_SPACING_MS, CALL_SPACING_MS]);
  });

  it("skips a weekend and a market holiday without spending a call", async () => {
    for (const now of [SATURDAY, THANKSGIVING]) {
      const h = harness({ now });
      expect(await runStockIngest(h.deps)).toMatchObject({ skipped: "not-a-trading-day", stored: [] });
      expect(h.calls).toEqual([]);
    }
  });

  it("is idempotent: a symbol already stored for the day costs no call, so a repeated run spends nothing", async () => {
    const h = harness({ held: new Set(["AAPL", "MSFT", "NVDA"]) });
    const summary = await runStockIngest(h.deps);
    expect(summary.alreadyHad).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(h.calls).toEqual([]);
  });

  it("stops at the budget: a refused reservation ends the run before any further call leaves", async () => {
    const h = harness({ grants: 1 });
    const summary = await runStockIngest(h.deps);

    expect(summary.refused).toBe(true);
    expect(summary.stored).toEqual(["AAPL"]);
    expect(h.calls).toEqual(["AAPL"]);
  });

  it("does not store a price whose latest trading day is not the day being priced", async () => {
    const h = harness({ day: "2026-10-12" });
    const summary = await runStockIngest(h.deps);
    expect(summary.notYetPublished).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(h.stored).toEqual([]);
  });

  it("records a failed symbol and carries on with the rest", async () => {
    const h = harness({
      fetchFn: async (url) => {
        const symbol = new URL(url).searchParams.get("symbol")!;
        return symbol === "MSFT" ? { ok: true, status: 200, json: async () => ({ Information: "limit reached" }) } : quoteFor(symbol, "2026-10-13");
      },
    });
    const summary = await runStockIngest(h.deps);

    expect(summary.stored).toEqual(["AAPL", "NVDA"]);
    expect(summary.failed).toEqual([{ symbol: "MSFT", reason: expect.stringContaining("the provider refused") }]);
  });
});

describe("isAuthorized", () => {
  const request = (authorization?: string) => new Request("http://x/api/cron/ingest", authorization ? { headers: { authorization } } : undefined);

  it("accepts exactly Bearer <secret>", () => {
    expect(isAuthorized(request("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a missing header, a wrong secret, a bare secret, and any request when no secret is set", () => {
    expect(isAuthorized(request(), "s3cret")).toBe(false);
    expect(isAuthorized(request("Bearer other"), "s3cret")).toBe(false);
    expect(isAuthorized(request("s3cret"), "s3cret")).toBe(false);
    expect(isAuthorized(request("Bearer "), "")).toBe(false);
    expect(isAuthorized(request("Bearer undefined"), undefined)).toBe(false);
  });
});
