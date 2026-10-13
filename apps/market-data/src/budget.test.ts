import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { BUDGETS, BudgetExceeded, providerDay, reserveCall, windowKey } from "./budget.js";

describe("the provider budgets", () => {
  it("caps Alpha Vantage below its 25 a day, with headroom", () => {
    expect(BUDGETS.alphavantage.cap).toBe(20);
    expect(BUDGETS.alphavantage.cap).toBeLessThan(25);
  });

  it("caps CoinGecko at 90% of its 10,000 a month", () => {
    expect(BUDGETS.coingecko.cap).toBe(9000);
  });

  it("rolls the provider-day over at midnight UTC, not a second before", () => {
    expect(providerDay(new Date("2026-10-13T23:59:59.999Z"))).toBe("2026-10-13");
    expect(providerDay(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14");
  });

  it("keys a stock call by the day and a crypto call by the month", () => {
    const now = new Date("2026-10-31T23:00:00Z");
    expect(windowKey("alphavantage", now)).toBe("2026-10-31");
    expect(windowKey("coingecko", now)).toBe("2026-10");
    expect(windowKey("coingecko", new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });
});

describe("reserveCall", () => {
  const pool = {} as Pool;
  const now = new Date("2026-10-13T23:00:00Z");

  it("returns the count of a granted call and logs nothing", async () => {
    const warnings: unknown[] = [];
    const calls = await reserveCall(pool, "alphavantage", now, { log: { warn: (...args) => warnings.push(args) }, reserve: async () => ({ granted: true, calls: 7, cap: 20 }) });
    expect(calls).toBe(7);
    expect(warnings).toEqual([]);
  });

  it("refuses a call over the cap, logs the refusal with the provider, window and cap, and throws", async () => {
    const warnings: Array<[string, Record<string, unknown>]> = [];
    const seen: unknown[][] = [];
    const attempt = reserveCall(pool, "alphavantage", now, {
      log: { warn: (message, fields) => warnings.push([message, fields]) },
      reserve: async (...args) => {
        seen.push(args.slice(1));
        return { granted: false, calls: 20, cap: 20 };
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(BudgetExceeded);
    await expect(attempt).rejects.toThrow("alphavantage call refused: 20 calls already made in 2026-10-13.");
    expect(seen[0]).toEqual(["alphavantage", "2026-10-13", 20]);
    expect(warnings[0]).toEqual(["provider call refused before it left the process", { provider: "alphavantage", window: "2026-10-13", calls: 20, cap: 20 }]);
  });
});
