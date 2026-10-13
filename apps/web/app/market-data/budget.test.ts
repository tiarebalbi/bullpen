import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { BUDGETS, BudgetExceeded, capFor, ledgerName, providerDay, reserveCall, windowKey } from "./budget.js";

describe("the provider budgets", () => {
  it("caps Alpha Vantage below its 25 a day, with headroom", () => {
    expect(BUDGETS.alphavantage.cap).toBe(20);
    expect(BUDGETS.alphavantage.cap).toBeLessThan(25);
  });

  it("caps CoinGecko at 90% of its 10,000 a month", () => {
    expect(BUDGETS.coingecko.cap).toBe(9000);
  });

  it("keeps production's cap and a preview's cap inside the provider's 25 a day", () => {
    expect(capFor("alphavantage", "production")).toBe(20);
    expect(capFor("alphavantage", "preview")).toBe(5);
    expect(capFor("alphavantage", undefined)).toBe(5);
    expect(capFor("alphavantage", "production") + capFor("alphavantage", "preview")).toBeLessThanOrEqual(25);
    expect(capFor("coingecko", "preview")).toBeLessThan(capFor("coingecko", "production"));
  });

  it("counts non-production calls on their own ledger row, production's on the provider's", () => {
    expect(ledgerName("alphavantage", "production")).toBe("alphavantage");
    expect(ledgerName("alphavantage", "preview")).toBe("alphavantage:non-production");
    expect(ledgerName("coingecko", undefined)).toBe("coingecko:non-production");
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

  it("reserves with the preview cap on the non-production row outside production, and production's on its own", async () => {
    const seen: Array<[string, number]> = [];
    const reserve = async (_p: Pool, name: string, _w: string, cap: number) => {
      seen.push([name, cap]);
      return { granted: true, calls: 1, cap };
    };
    await reserveCall(pool, "alphavantage", now, { reserve, vercelEnv: "preview" });
    await reserveCall(pool, "alphavantage", now, { reserve, vercelEnv: "production" });
    expect(seen).toEqual([
      ["alphavantage:non-production", 5],
      ["alphavantage", 20],
    ]);
  });

  it("refuses a call over the cap, logs the refusal with the provider, window and cap, and throws", async () => {
    const warnings: Array<[string, Record<string, unknown>]> = [];
    const seen: unknown[][] = [];
    const attempt = reserveCall(pool, "alphavantage", now, {
      vercelEnv: "production",
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
