import type { StockPrice } from "@bullpen/db-trading";
import type { StockPriceSnapshot } from "@bullpen/contracts";

/** The price contract's rows as the wire carries them: what `/api/stock-prices` answers and what the price stream pushes. One shape, so the fallback and the stream cannot disagree. */
export function toStockPriceSnapshot(prices: readonly StockPrice[]): StockPriceSnapshot {
  return {
    rows: prices.map(({ symbol, price, asOf, stale, previous }) => ({
      symbol,
      price,
      asOf: asOf.toISOString(),
      stale,
      previousClose: previous ? { price: previous.price, asOf: previous.asOf.toISOString() } : null,
    })),
  };
}
