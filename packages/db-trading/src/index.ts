import pg from "pg";

export { migrate } from "./migrate.js";
export { BuyRefused, placeMarketBuy, type BuyHooks, type Fill, type MarketBuy } from "./buy.js";
export { ORDER_STATES, OPEN_STATES, TRANSITIONS, canTransition, fillBucket, isOpen, stateAfterFill, type OrderState } from "./orders/states.js";
export { CAP_MARGIN, CrashError, LATE_FILL_WINDOW_MS, bookFill, confirmCancel, markWorking, recordReleaseFailure, rejectOrder, releaseReservation, requestCancel, submitOrder, type Boundary, type FillEvent, type FillOutcome, type Hooks, type ReleaseOutcome, type SubmitOrder, type Submitted } from "./orders/lifecycle.js";
export { DerivedVenue, MAX_FILL_PRICE_AGE_MS, SimulatedVenue, dbPriceSource, seeded, type PriceSource, type Quote, type DerivedVenueOptions, type SimulatedVenueOptions, type Venue, type VenueEvent, type VenueOrder, type VenueRefusal } from "./orders/venue.js";
export { ACCEPT_TIMEOUT_MS, CANCEL_RESEND_MS, CANCEL_STUCK_MS, MAX_RELEASE_FAILURES, WORKING_DEADLINE_MS, dispatchOrder, pump, sweep, type SweepResult } from "./orders/sweep.js";
export { tick, type TickResult } from "./orders/tick.js";
export { CANCEL_ACK_DELAY_MS, SIMULATOR_SEED, advanceAccount, cancelPlayerOrder, createSimulatedVenue, placePlayerOrder, type AdvanceResult, type PlacedOrder } from "./orders/player.js";
export { ORDERS_SHOWN, readAccountView, type AccountView, type OrderRow, type PositionRow } from "./orders/view.js";
export { checkEquityInvariant, checkOrderInvariants, type AccountStart } from "./orders/invariants.js";
export { readPrices, type ReadPricesOptions, type StockPrice } from "./prices.js";
export { STARTING_CASH, ensurePlayerAccount, neutralHandle, type PlayerAccount } from "./players.js";
export { EXPECTED_COLUMNS, EXPECTED_RELATIONS, checkSchema } from "./health.js";
export { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE } from "./testRows.js";
export { LEADERBOARD_ON_READ_SQL, LEADERBOARD_TOP, MAX_AGE_MS, computeLeaderboardOnRead, readLeaderboard, readLeaderboardRows, refreshLeaderboard, serveLeaderboard, type LeaderboardRead, type LeaderboardRow, type ReadLeaderboardOptions, type RefreshHooks, type RefreshOutcome, type ServeOptions } from "./leaderboard.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "trading_owner";
export const SCHEMA = "trading";

/** A pool that connects with the trading owner's own URL. */
export function createPool(connectionString: string, max = 3): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
