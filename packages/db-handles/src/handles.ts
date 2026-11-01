import type { Pool } from "pg";

export type HandleStatus = "pending" | "approved" | "review" | "rejected";

export const HANDLE_REVIEW_REASONS = ["below-threshold", "timeout", "rate-limited", "malformed", "no-key", "unavailable"] as const;
export type ReviewReason = (typeof HANDLE_REVIEW_REASONS)[number];

/** A player's own handle, as the account page may show it to that player: any status. Never served to anyone else. */
export interface OwnHandle {
  handleId: string;
  handle: string;
  status: HandleStatus;
}

/** How many times a player may save a handle in the window, and how long the window is. */
export const CHANGE_LIMIT = 5;
export const CHANGE_WINDOW_HOURS = 24;
/** A handle that has stayed `pending` this long was saved but never decided (the decision could not be recorded): an admin may approve, reject or retry it. */
export const STUCK_AFTER_MINUTES = 10;

export type Submitted =
  | { ok: true; handleId: string }
  | { ok: false; reason: "taken" }
  /** The player has saved CHANGE_LIMIT handles in the window. Nothing was saved, and no model should be asked. */
  | { ok: false; reason: "limit"; retryAfterSeconds: number };

const UNIQUE_VIOLATION = "23505";

/**
 * Saves a new or changed handle as 'pending', drops any queue entry the old one had, and counts the change, all in one transaction: a failure part way
 * leaves the old handle and its queue entry exactly as they were. The limit is checked first, under a lock on the player so two saves at once cannot both
 * pass, and a refused save changes nothing and counts nothing. A handle already held by another player, ignoring case, is refused with 'taken'. The same
 * player saving the same handle again is allowed (it counts as a change): it puts the handle back to 'pending', which is how a decision that never arrived is
 * retried by the player. Nothing here decides anything.
 */
export async function submitHandle(pool: Pool, userId: string, handle: string): Promise<Submitted> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`handle-changes:${userId}`]);
    await client.query("DELETE FROM handles.handle_changes WHERE owner_user_id = $1 AND changed_at < now() - make_interval(hours => $2)", [userId, CHANGE_WINDOW_HOURS]);
    const recent = await client.query<{ count: string; retry_after: string | null }>(
      `SELECT count(*)::text AS count, GREATEST(0, EXTRACT(EPOCH FROM (min(changed_at) + make_interval(hours => $2) - now())))::text AS retry_after
         FROM handles.handle_changes WHERE owner_user_id = $1`,
      [userId, CHANGE_WINDOW_HOURS],
    );
    if (Number(recent.rows[0]!.count) >= CHANGE_LIMIT) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "limit", retryAfterSeconds: Math.max(1, Math.ceil(Number(recent.rows[0]!.retry_after ?? 0))) };
    }
    const saved = await client.query<{ handle_id: string }>(
      `INSERT INTO handles.handle (owner_user_id, handle, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (owner_user_id) DO UPDATE
         SET handle = EXCLUDED.handle, status = 'pending', probability = NULL, submitted_at = now(), decided_at = NULL
       RETURNING handle_id`,
      [userId, handle],
    );
    const handleId = saved.rows[0]!.handle_id;
    await client.query("DELETE FROM handles.review_queue WHERE handle_id = $1", [handleId]);
    await client.query("INSERT INTO handles.handle_changes (owner_user_id) VALUES ($1)", [userId]);
    await client.query("COMMIT");
    return { ok: true, handleId };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw error;
  } finally {
    client.release();
  }
}

export interface Decision {
  handleId: string;
  /** The handle the decision was made about. A decision for a handle the player has since changed is dropped. */
  handle: string;
  outcome: "approved" | "review";
  /** The model's probability, when it gave one. */
  probability: number | null;
  /** Why the handle is in review: required for 'review', ignored for 'approved'. */
  reason?: ReviewReason;
}

/**
 * Records the moderation answer for a handle that is still 'pending' and still the same text. Returns false when the player changed or removed it meanwhile (the
 * newer submission has its own decision), so a slow answer can never approve a handle other than the one it was asked about.
 */
export async function recordDecision(pool: Pool, decision: Decision): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE handles.handle SET status = $3, probability = $4, decided_at = now()
        WHERE handle_id = $1 AND status = 'pending' AND handle = $2`,
      [decision.handleId, decision.handle, decision.outcome, decision.probability],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    if (decision.outcome === "review") {
      await client.query("INSERT INTO handles.review_queue (handle_id, reason) VALUES ($1, $2) ON CONFLICT (handle_id) DO NOTHING", [decision.handleId, decision.reason ?? "unavailable"]);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readOwnHandle(pool: Pool, userId: string): Promise<OwnHandle | null> {
  const { rows } = await pool.query<{ handle_id: string; handle: string; status: HandleStatus }>("SELECT handle_id, handle, status FROM handles.handle WHERE owner_user_id = $1", [userId]);
  const row = rows[0];
  return row ? { handleId: row.handle_id, handle: row.handle, status: row.status } : null;
}

export interface QueueItem {
  handleId: string;
  handle: string;
  probability: number | null;
  reason: ReviewReason;
  enqueuedAt: Date;
}

/** The handles waiting for a person, oldest first. Carries no user id: a reviewer judges the text and acts by handle id. */
export async function listReviewQueue(pool: Pool, limit = 100): Promise<QueueItem[]> {
  const { rows } = await pool.query<{ handle_id: string; handle: string; probability: string | null; reason: ReviewReason; enqueued_at: Date }>(
    `SELECT h.handle_id, h.handle, h.probability::text, q.reason, q.enqueued_at
       FROM handles.review_queue q JOIN handles.handle h ON h.handle_id = q.handle_id
      WHERE h.status = 'review' ORDER BY q.enqueued_at, h.handle_id LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return rows.map((row) => ({ handleId: row.handle_id, handle: row.handle, probability: row.probability === null ? null : Number(row.probability), reason: row.reason, enqueuedAt: row.enqueued_at }));
}

export interface StuckItem {
  handleId: string;
  handle: string;
  submittedAt: Date;
}

/** Handles that have been 'pending' for more than STUCK_AFTER_MINUTES, oldest first: saved, never decided. Carries no user id. */
export async function listStuckPending(pool: Pool, limit = 100): Promise<StuckItem[]> {
  const { rows } = await pool.query<{ handle_id: string; handle: string; submitted_at: Date }>(
    `SELECT handle_id, handle, submitted_at FROM handles.handle
      WHERE status = 'pending' AND submitted_at < now() - make_interval(mins => $1)
      ORDER BY submitted_at, handle_id LIMIT $2`,
    [STUCK_AFTER_MINUTES, Math.max(1, Math.min(limit, 500))],
  );
  return rows.map((row) => ({ handleId: row.handle_id, handle: row.handle, submittedAt: row.submitted_at }));
}

/** One stuck pending handle, or null when it is not (or no longer) stuck: decided meanwhile, changed by the player, or not yet old enough. */
export async function readStuckPending(pool: Pool, handleId: string): Promise<StuckItem | null> {
  const { rows } = await pool.query<{ handle_id: string; handle: string; submitted_at: Date }>(
    `SELECT handle_id, handle, submitted_at FROM handles.handle
      WHERE handle_id = $1 AND status = 'pending' AND submitted_at < now() - make_interval(mins => $2)`,
    [handleId, STUCK_AFTER_MINUTES],
  );
  const row = rows[0];
  return row ? { handleId: row.handle_id, handle: row.handle, submittedAt: row.submitted_at } : null;
}

/**
 * A person's decision on a handle in review, or on one stuck pending. False when it is neither any more (decided already, changed by the player, or a pending
 * handle that is not yet old enough to be stuck: the model's answer may still arrive).
 */
export async function resolveReview(pool: Pool, handleId: string, action: "approve" | "reject"): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE handles.handle SET status = $2, decided_at = now()
        WHERE handle_id = $1 AND (status = 'review' OR (status = 'pending' AND submitted_at < now() - make_interval(mins => $3)))`,
      [handleId, action === "approve" ? "approved" : "rejected", STUCK_AFTER_MINUTES],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("DELETE FROM handles.review_queue WHERE handle_id = $1", [handleId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
