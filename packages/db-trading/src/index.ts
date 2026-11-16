import pg from "pg";

export { migrate } from "./migrate.js";
export { BuyRefused, placeMarketBuy, type BuyHooks, type Fill, type MarketBuy } from "./buy.js";
export { ORDER_STATES, OPEN_STATES, TRANSITIONS, canTransition, fillBucket, isOpen, stateAfterFill, type OrderState } from "./orders/states.js";
export { CAP_MARGIN, CrashError, admitQueuedOrder, LATE_FILL_WINDOW_MS, bookFill, confirmCancel, markWorking, recordReleaseFailure, rejectOrder, releaseReservation, requestCancel, submitOrder, type AdmitOutcome, type Boundary, type SubmitOptions, type FillEvent, type FillOutcome, type Hooks, type ReleaseOutcome, type SubmitOrder, type Submitted } from "./orders/lifecycle.js";
export { DerivedVenue, MAX_FILL_PRICE_AGE_MS, SimulatedVenue, dbPriceSource, isFillable, seeded, type PriceKind, type PriceSource, type Quote, type DerivedVenueOptions, type SimulatedVenueOptions, type Venue, type VenueEvent, type VenueOrder, type VenueRefusal } from "./orders/venue.js";
export { ACCEPT_TIMEOUT_MS, ADMIT_BATCH_SIZE, ADMIT_BUDGET_MS, CANCEL_RESEND_MS, CANCEL_STUCK_MS, MAX_RELEASE_FAILURES, WORKING_DEADLINE_MS, dispatchOrder, pump, sweep, type SweepOptions, type SweepResult } from "./orders/sweep.js";
export { tick, type TickResult } from "./orders/tick.js";
export { CANCEL_ACK_DELAY_MS, SIMULATOR_SEED, advanceAccount, cancelPlayerOrder, createSimulatedVenue, placePlayerOrder, type AdvanceResult, type PlacedOrder } from "./orders/player.js";
export { FILLS_SHOWN, ORDERS_SHOWN, readAccountView, type AccountView, type FillRow, type OrderEventRow, type OrderRow, type PositionRow } from "./orders/view.js";
export { checkEquityInvariant, checkOrderInvariants, type AccountStart } from "./orders/invariants.js";
export { readPrices, type ReadPricesOptions, type StockPrice } from "./prices.js";
export { STARTING_CASH, ensurePlayerAccount, findPlayerAccount, neutralHandle, type PlayerAccount } from "./players.js";
export { EXPECTED_COLUMNS, EXPECTED_RELATIONS, checkSchema } from "./health.js";
export { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE } from "./testRows.js";
export { LEADERBOARD_ON_READ_SQL, LEADERBOARD_TOP, MAX_AGE_MS, computeLeaderboardOnRead, readLeaderboard, readLeaderboardRows, refreshLeaderboard, serveLeaderboard, type LeaderboardRead, type LeaderboardRow, type ReadLeaderboardOptions, type RefreshHooks, type RefreshOutcome, type ServeOptions } from "./leaderboard.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "trading_owner";
export const SCHEMA = "trading";

export interface PoolOptions {
  /** The most connections this pool opens. Work beyond it waits for a free one: a pool is also a concurrency limit. */
  max?: number;
  /** Shown in pg_stat_activity, so a measurement can count one pool's connections apart from another's. */
  applicationName?: string;
  /** How long a request waits for a free connection before it fails (a safe refusal), instead of waiting without end. */
  connectionTimeoutMillis?: number;
  /** An idle connection is closed after this long. */
  idleTimeoutMillis?: number;
}

/** A pool that connects with the trading owner's own URL. A number is the maximum, as before. */
export function createPool(connectionString: string, options: number | PoolOptions = 3): pg.Pool {
  const { max = 3, applicationName, connectionTimeoutMillis, idleTimeoutMillis } = typeof options === "number" ? { max: options } : options;
  return logIdleError(new pg.Pool({ connectionString, max, application_name: applicationName, connectionTimeoutMillis, idleTimeoutMillis }), "trading");
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

