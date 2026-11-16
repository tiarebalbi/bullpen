import type { createPool } from "@bullpen/db-trading";
import { makeTradingPool } from "../makePool.js";

/** Room for the read-heavy routes: prices, the price stream, the leaderboard, the account poll. Smaller wait than orders: a read that is late is better refused than queued. */
export const READ_POOL = { name: "bullpen-reads", max: 4, waitMs: 2_000 } as const;

let pool: ReturnType<typeof createPool> | undefined;

/** The pool of the read paths. It never serves an order. */
export function readPool(): ReturnType<typeof createPool> {
  pool ??= makeTradingPool(READ_POOL);
  return pool;
}
