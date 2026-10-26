import type { Pool } from "pg";
import { TEST_QUOTE_SOURCE } from "./testRows.js";

export interface StockPrice {
  symbol: string;
  /** A decimal string, so a price never passes through a float. */
  price: string;
  /** When the price is as of: the close it belongs to. */
  asOf: Date;
  source: string;
  /** Older than its expected cadence: the price contract sets this, not the reader. */
  stale: boolean;
  /** The quote stored just before this one, or null when there is none: a change is shown only when both exist. */
  previous: { price: string; asOf: Date } | null;
}

export interface ReadPricesOptions {
  /** Include quotes whose source is the test marker. A page never does; a test that seeds its own prices does. */
  includeTestRows?: boolean;
}

/**
 * The latest price of every symbol, read through the price contract, the only
 * way the trading owner may read market data. Test-marked quotes are left out
 * unless asked for, so a measurement run can never show up as a price.
 */
export async function readPrices(pool: Pool, { includeTestRows = false }: ReadPricesOptions = {}): Promise<StockPrice[]> {
  const { rows } = await pool.query<{ symbol: string; price: string; as_of: Date; source: string; stale: boolean; previous_price: string | null; previous_as_of: Date | null }>(
    "SELECT symbol, price::text, as_of, source, stale, previous_price::text, previous_as_of FROM market_data.prices_v1 WHERE ($1::boolean OR source <> $2) ORDER BY symbol",
    [includeTestRows, TEST_QUOTE_SOURCE],
  );
  return rows.map((row) => ({ symbol: row.symbol, price: row.price, asOf: row.as_of, source: row.source, stale: row.stale,
    previous: row.previous_price !== null && row.previous_as_of !== null ? { price: row.previous_price, asOf: row.previous_as_of } : null,
  }));
}
