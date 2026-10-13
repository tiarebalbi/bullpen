import pg from "pg";

export { migrate } from "./migrate.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "trading_owner";
export const SCHEMA = "trading";

/** A pool that connects with the trading owner's own URL. */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 3 });
}
