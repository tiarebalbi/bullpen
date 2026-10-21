import pg from "pg";

export { migrate } from "./migrate.js";
export { BuyRefused, placeMarketBuy, type BuyHooks, type Fill, type MarketBuy } from "./buy.js";
export { ORDER_STATES, OPEN_STATES, TRANSITIONS, canTransition, fillBucket, isOpen, stateAfterFill, type OrderState } from "./orders/states.js";
export { CAP_MARGIN, CrashError, LATE_FILL_WINDOW_MS, bookFill, confirmCancel, markWorking, recordReleaseFailure, releaseReservation, requestCancel, submitOrder, type Boundary, type FillEvent, type FillOutcome, type Hooks, type ReleaseOutcome, type SubmitOrder, type Submitted } from "./orders/lifecycle.js";
export { MAX_FILL_PRICE_AGE_MS, SimulatedVenue, dbPriceSource, seeded, type PriceSource, type Quote, type SimulatedVenueOptions, type Venue, type VenueEvent, type VenueOrder } from "./orders/venue.js";
export { ACCEPT_TIMEOUT_MS, CANCEL_RESEND_MS, CANCEL_STUCK_MS, MAX_RELEASE_FAILURES, WORKING_DEADLINE_MS, dispatchOrder, pump, sweep, type SweepResult } from "./orders/sweep.js";
export { checkOrderInvariants, type AccountStart } from "./orders/invariants.js";
export { readPrices, type ReadPricesOptions, type StockPrice } from "./prices.js";
export { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE } from "./testRows.js";
export { LEADERBOARD_ON_READ_SQL, LEADERBOARD_TOP, MAX_AGE_MS, computeLeaderboardOnRead, readLeaderboard, readLeaderboardRows, refreshLeaderboard, serveLeaderboard, type LeaderboardRead, type LeaderboardRow, type ReadLeaderboardOptions, type RefreshHooks, type RefreshOutcome, type ServeOptions } from "./leaderboard.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "trading_owner";
export const SCHEMA = "trading";

/** A pool that connects with the trading owner's own URL. */
export function createPool(connectionString: string, max = 3): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
