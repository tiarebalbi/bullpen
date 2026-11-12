import pg from "pg";

export { migrate } from "./migrate.js";
export { reserveProviderCall, type CallReservation } from "./budget.js";
export { hasQuote, storeQuote, type StoredQuote } from "./quotes.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "market_data_owner";
export const SCHEMA = "market_data";

/** A pool that connects with the market-data owner's own URL. */
export function createPool(connectionString: string, max = 3): pg.Pool {
  return logIdleError(new pg.Pool({ connectionString, max }), "market-data");
}
/**
 * An idle connection the database closes (a restart, a failover, Neon suspending a compute) makes the pool emit "error". With no listener, Node ends the process on it,
 * which is what a cold database did to the whole instance in the Part 5 stress run. The pool drops that connection by itself; this says so in the log and carries on.
 */
export function logIdleError(pool: pg.Pool, name: string): pg.Pool {
  pool.on("error", (error: Error & { code?: string }) => {
    console.error(JSON.stringify({ at: `${name}.pool.idle-error`, code: error.code, message: String(error.message).slice(0, 200) }));
  });
  return pool;
}

