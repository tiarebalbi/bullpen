import pg from "pg";

export { migrate } from "./migrate.js";
export { BuyRefused, placeMarketBuy, type BuyHooks, type Fill, type MarketBuy } from "./buy.js";
export { LEADERBOARD_ON_READ_SQL, MAX_AGE_MS, computeLeaderboardOnRead, readLeaderboard, readLeaderboardRows, refreshLeaderboard, serveLeaderboard, type LeaderboardRead, type LeaderboardRow, type RefreshHooks, type RefreshOutcome, type ServeOptions } from "./leaderboard.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "trading_owner";
export const SCHEMA = "trading";

/** A pool that connects with the trading owner's own URL. */
export function createPool(connectionString: string, max = 3): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
