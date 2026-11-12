import pg from "pg";

export { migrate } from "./migrate.js";
export {
  HANDLE_REVIEW_REASONS,
  CHANGE_LIMIT,
  CHANGE_WINDOW_HOURS,
  STUCK_AFTER_MINUTES,
  readOwnHandle,
  listReported,
  listReviewQueue,
  listStuckPending,
  readStuckPending,
  dismissReports,
  recordDecision,
  reportHandle,
  resolveReview,
  revokeHandle,
  submitHandle,
  type Decision,
  type HandleStatus,
  type OwnHandle,
  type QueueItem,
  type ReportedItem,
  type ReportResult,
  type StuckItem,
  type ReviewReason,
  type Submitted,
} from "./handles.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "handles_owner";
export const SCHEMA = "handles";

/** A pool that connects with the handles owner's own URL. */
export function createPool(connectionString: string, max = 2): pg.Pool {
  return logIdleError(new pg.Pool({ connectionString, max }), "handles");
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

