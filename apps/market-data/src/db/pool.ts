import { createPool } from "@bullpen/db-market-data";

let pool: ReturnType<typeof createPool> | undefined;

/** The market-data owner's pool. Only this directory reads the market-data database URL. */
export function marketDataPool(): ReturnType<typeof createPool> {
  const url = process.env.DATABASE_URL_MARKET_DATA;
  if (!url) throw new Error("DATABASE_URL_MARKET_DATA is not set");
  pool ??= createPool(url);
  return pool;
}
