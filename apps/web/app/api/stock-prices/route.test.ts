import { beforeEach, describe, expect, it, vi } from "vitest";

const readPrices = vi.fn();
vi.mock("@bullpen/db-trading", () => ({ readPrices }));
vi.mock("../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));

const { GET } = await import("./route.js");

describe("GET /api/stock-prices", () => {
  beforeEach(() => {
    readPrices.mockReset();
  });

  it("returns each symbol's price with its as-of time and stale flag, and never caches it", async () => {
    readPrices.mockResolvedValue([
      { symbol: "AAPL", price: "190.12000000", asOf: new Date("2026-10-13T20:00:00Z"), source: "alphavantage", stale: false, previous: { price: "188.00000000", asOf: new Date("2026-10-12T20:00:00Z") } },
      { symbol: "MSFT", price: "410.00000000", asOf: new Date("2026-10-08T20:00:00Z"), source: "alphavantage", stale: true, previous: null },
    ]);
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      rows: [
        { symbol: "AAPL", price: "190.12000000", asOf: "2026-10-13T20:00:00.000Z", stale: false, previousClose: { price: "188.00000000", asOf: "2026-10-12T20:00:00.000Z" } },
        { symbol: "MSFT", price: "410.00000000", asOf: "2026-10-08T20:00:00.000Z", stale: true, previousClose: null },
      ],
    });
  });

  it("does not pass the provider through: the response has no source field", async () => {
    readPrices.mockResolvedValue([{ symbol: "AAPL", price: "1", asOf: new Date(), source: "alphavantage", stale: false, previous: null }]);
    expect(JSON.stringify(await (await GET()).json())).not.toMatch(/alphavantage|source/i);
  });

  it("answers 503 with a plain message when the database cannot be reached", async () => {
    readPrices.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Stock prices unavailable." });
  });
});
