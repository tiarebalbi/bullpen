import type { Pool } from "pg";

export interface StockPrice {
  symbol: string;
  /** A decimal string, so a price never passes through a float. */
  price: string;
  /** When the price is as of: the close it belongs to. */
  asOf: Date;
  source: string;
  /** Older than its expected cadence: the price contract sets this, not the reader. */
  stale: boolean;
}

/**
 * The latest price of every symbol, read through the price contract, the only
 * way the trading owner may read market data.
 */
export async function readPrices(pool: Pool): Promise<StockPrice[]> {
  const { rows } = await pool.query<{ symbol: string; price: string; as_of: Date; source: string; stale: boolean }>(
    "SELECT symbol, price::text, as_of, source, stale FROM market_data.prices_v1 ORDER BY symbol",
  );
  return rows.map((row) => ({ symbol: row.symbol, price: row.price, asOf: row.as_of, source: row.source, stale: row.stale }));
}
