import type { Pool } from "pg";

export interface StoredQuote {
  symbol: string;
  /** A decimal string, so a price never passes through a float. */
  price: string;
  asOf: Date;
  source: string;
  /** When the price stops being current, from the symbol's expected cadence. */
  validUntil: Date;
  /** 'end-of-day' for a close, which stays current until the next trading day's close is expected; 'live' (the default) for a price that moves during the day. */
  kind?: "live" | "end-of-day";
}

/** Stores a quote. A quote already stored for the same symbol and as-of time is left alone: a repeated run changes nothing. */
export async function storeQuote(pool: Pool, quote: StoredQuote): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until, kind)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (symbol, as_of) DO NOTHING`,
    [quote.symbol, quote.asOf, quote.price, quote.source, quote.validUntil, quote.kind ?? "live"],
  );
  return rowCount === 1;
}

/** Whether a quote for this symbol and as-of time is already stored, so a repeated run spends no provider call. */
export async function hasQuote(pool: Pool, symbol: string, asOf: Date): Promise<boolean> {
  const { rowCount } = await pool.query("SELECT 1 FROM market_data.quotes WHERE symbol = $1 AND as_of = $2", [symbol, asOf]);
  return rowCount === 1;
}
