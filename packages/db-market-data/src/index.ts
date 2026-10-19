import pg from "pg";

export { migrate } from "./migrate.js";
export { reserveProviderCall, type CallReservation } from "./budget.js";
export { hasQuote, storeQuote, type StoredQuote } from "./quotes.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "market_data_owner";
export const SCHEMA = "market_data";

/** A pool that connects with the market-data owner's own URL. */
export function createPool(connectionString: string, max = 3): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
