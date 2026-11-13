import type { createPool } from "@bullpen/db-trading";
import { makeTradingPool } from "../makePool.js";

/** Room for the order path alone: placing, cancelling, the sweep. Reads never take a connection from here (structure.adl, ADR-0030). */
export const ORDER_POOL = { name: "bullpen-orders", max: 6, waitMs: 5_000 } as const;

let pool: ReturnType<typeof createPool> | undefined;

/** The pool of the order path. A request that cannot get a connection within five seconds is refused, not left waiting. */
export function orderPool(): ReturnType<typeof createPool> {
  pool ??= makeTradingPool(ORDER_POOL);
  return pool;
}
