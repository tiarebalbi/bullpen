import pg from "pg";

export { migrate } from "./migrate.js";
export {
  HANDLE_REVIEW_REASONS,
  readOwnHandle,
  listReviewQueue,
  recordDecision,
  resolveReview,
  submitHandle,
  type Decision,
  type HandleStatus,
  type OwnHandle,
  type QueueItem,
  type ReviewReason,
  type Submitted,
} from "./handles.js";

/** The runtime role this module connects as, and the schema it owns. */
export const OWNER_ROLE = "handles_owner";
export const SCHEMA = "handles";

/** A pool that connects with the handles owner's own URL. */
export function createPool(connectionString: string, max = 2): pg.Pool {
  return new pg.Pool({ connectionString, max });
}
