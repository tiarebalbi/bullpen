import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { createPool as createTradingPool, readPrices } from "@bullpen/db-trading";

const urls = inject("dbUrls");
const trading = createTradingPool(urls.tradingOwner);
const marketData = createMarketDataPool(urls.marketDataOwner);
afterAll(async () => {
  await trading.end();
  await marketData.end();
});

const symbol = (): string => `P${randomUUID().slice(0, 7).toUpperCase()}`;

describe("readPrices: the trading owner reads prices through the contract", () => {
  it("returns the latest price of a symbol with its as-of time and stale flag", async () => {
    const fresh = symbol();
    const old = symbol();
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() - interval '2 days', 100, 'test', now() + interval '1 day'), ($1, now() - interval '1 hour', 123.45, 'test', now() + interval '1 day'), ($2, now() - interval '5 days', 9, 'test', now() - interval '1 day')", [fresh, old]);

    const prices = await readPrices(trading, { includeTestRows: true });
    const latest = prices.find((p) => p.symbol === fresh)!;
    const stale = prices.find((p) => p.symbol === old)!;

    expect(latest).toMatchObject({ price: "123.45000000", source: "test", stale: false });
    expect(latest.asOf).toBeInstanceOf(Date);
    expect(prices.filter((p) => p.symbol === fresh)).toHaveLength(1); // one row per symbol, the latest
    expect(stale).toMatchObject({ price: "9.00000000", stale: true });
  });

  it("carries the previous stored close, and null when only one close is stored", async () => {
    const two = symbol();
    const one = symbol();
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until, kind) VALUES ($1, now() - interval '3 days', 100, 'test', now() + interval '1 day', 'end-of-day'), ($1, now() - interval '2 days', 90, 'test', now() + interval '1 day', 'end-of-day'), ($1, now() - interval '1 day', 110, 'test', now() + interval '1 day', 'end-of-day'), ($2, now() - interval '1 day', 5, 'test', now() + interval '1 day', 'end-of-day')", [two, one]);
    const prices = await readPrices(trading, { includeTestRows: true });
    const latest = prices.find((p) => p.symbol === two)!;
    expect(latest).toMatchObject({ price: "110.00000000", previous: { price: "90.00000000" } });
    expect(latest.previous!.asOf).toBeInstanceOf(Date);
    expect(prices.find((p) => p.symbol === one)).toMatchObject({ previous: null });
  });
});
