import { createPool } from "@bullpen/db-trading";

let pool: ReturnType<typeof createPool> | undefined;

/** The trading owner's pool. Only this directory reads the trading database URL. */
export function tradingPool(): ReturnType<typeof createPool> {
  const url = process.env.DATABASE_URL_TRADING;
  if (!url) throw new Error("DATABASE_URL_TRADING is not set");
  pool ??= createPool(url);
  return pool;
}
