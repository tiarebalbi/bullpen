import type { Pool } from "pg";

export type HandleStatus = "pending" | "approved" | "review" | "rejected" | "revoked";

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
  /** This text was taken down after a report, for whoever had it, and nobody may save it again (they may choose another). The same answer for every player: it never says who had it. Nothing was saved, counted or asked. */
  | { ok: false; reason: "revoked" }
  /** The player has saved CHANGE_LIMIT handles in the window. Nothing was saved, and no model should be asked. */
  | { ok: false; reason: "limit"; retryAfterSeconds: number };

const UNIQUE_VIOLATION = "23505";

/**
 * Saves a new or changed handle as 'pending', drops any queue entry the old one had, and counts the change, all in one transaction: a failure part way
 * leaves the old handle and its queue entry exactly as they were. The limit is checked first, under a lock on the player so two saves at once cannot both
 * pass, and a refused save changes nothing and counts nothing. A handle text that was ever taken down after a report is refused with 'revoked', to any player (before the limit is counted, so it
 * costs nothing, and whether or not its old owner still holds the row); a handle already held by another player, ignoring case, is refused with 'taken'. The same
 * player saving the same handle again is allowed (it counts as a change): it puts the handle back to 'pending', which is how a decision that never arrived is
 * retried by the player. Nothing here decides anything.
 */
export async function submitHandle(pool: Pool, userId: string, handle: string): Promise<Submitted> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`handle-changes:${userId}`]);
    const taken = await client.query("SELECT 1 FROM handles.revoked WHERE handle_lower = lower($1) LIMIT 1", [handle]);
    if (taken.rowCount === 1) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "revoked" };
    }
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
    const before = await client.query<{ handle: string }>("SELECT handle FROM handles.handle WHERE owner_user_id = $1 FOR UPDATE", [userId]);
    const saved = await client.query<{ handle_id: string }>(
      `INSERT INTO handles.handle (owner_user_id, handle, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (owner_user_id) DO UPDATE
         SET handle = EXCLUDED.handle, status = 'pending', probability = NULL, submitted_at = now(), decided_at = NULL
       RETURNING handle_id`,
      [userId, handle],
    );
    const handleId = saved.rows[0]!.handle_id;
    await client.query("DELETE FROM handles.review_queue WHERE handle_id = $1", [handleId]);
    // A report is about the text it was made against: a changed handle starts with none.
    if (before.rows[0] && before.rows[0].handle.toLowerCase() !== handle.toLowerCase()) await client.query("DELETE FROM handles.reports WHERE handle_id = $1", [handleId]);
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

export type ReportResult =
  | { ok: true }
  /** No approved handle by that name: it was changed, taken down, or never approved. Only an approved handle is public, so only one can be reported. */
  | { ok: false; reason: "not-found" }
  /** A player's own handle. */
  | { ok: false; reason: "own" }
  /** This player already reported this handle. */
  | { ok: false; reason: "already" };

/**
 * A player's report of another player's approved handle, found by the name they saw on the leaderboard. One report for each reporter and handle; a second is "already". A report
 * stores the handle's id and the reporter's user id and the time, and nothing the reporter typed. Reporting your own handle is refused.
 */
export async function reportHandle(pool: Pool, reporterUserId: string, handle: string): Promise<ReportResult> {
  const found = await pool.query<{ handle_id: string; owner_user_id: string }>("SELECT handle_id, owner_user_id FROM handles.handle WHERE lower(handle) = lower($1) AND status = 'approved'", [handle]);
  const row = found.rows[0];
  if (!row) return { ok: false, reason: "not-found" };
  if (row.owner_user_id === reporterUserId) return { ok: false, reason: "own" };
  const inserted = await pool.query("INSERT INTO handles.reports (handle_id, reporter_user_id) VALUES ($1, $2) ON CONFLICT (handle_id, reporter_user_id) DO NOTHING", [row.handle_id, reporterUserId]);
  return inserted.rowCount === 1 ? { ok: true } : { ok: false, reason: "already" };
}

export interface ReportedItem {
  handleId: string;
  handle: string;
  /** How many players reported it and the admin has not dismissed. */
  reports: number;
  firstReportedAt: Date;
}

/** Approved handles with at least one report that has not been dismissed, the most reported first. Carries no user id and no reporter: a reviewer sees a count. */
export async function listReported(pool: Pool, limit = 100): Promise<ReportedItem[]> {
  const { rows } = await pool.query<{ handle_id: string; handle: string; reports: number; first_reported_at: Date }>(
    `SELECT h.handle_id, h.handle, count(*)::int AS reports, min(r.reported_at) AS first_reported_at
       FROM handles.reports r JOIN handles.handle h ON h.handle_id = r.handle_id
      WHERE h.status = 'approved' AND r.dismissed_at IS NULL
      GROUP BY h.handle_id, h.handle
      ORDER BY count(*) DESC, min(r.reported_at), h.handle_id LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return rows.map((row) => ({ handleId: row.handle_id, handle: row.handle, reports: row.reports, firstReportedAt: row.first_reported_at }));
}

/**
 * Takes an approved handle down: its status becomes 'revoked' (so handles.approved_v1 drops it and the leaderboard shows the neutral label at its next refresh), nobody may
 * save the same text again, and its reports are deleted (they have done their work). False when the handle is not approved any more (changed by the player, or already
 * decided).
 */
export async function revokeHandle(pool: Pool, handleId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query<{ handle: string }>(
      "UPDATE handles.handle SET status = 'revoked', decided_at = now() WHERE handle_id = $1 AND status = 'approved' RETURNING handle",
      [handleId],
    );
    const row = updated.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("INSERT INTO handles.revoked (handle_lower) VALUES (lower($1)) ON CONFLICT DO NOTHING", [row.handle]);
    await client.query("DELETE FROM handles.reports WHERE handle_id = $1", [handleId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** The admin's "this handle is fine": the open reports are dismissed (their rows stay, so those reporters cannot report it again), and the handle leaves the Reported list until another player reports it. False when there was nothing open. */
export async function dismissReports(pool: Pool, handleId: string): Promise<boolean> {
  const updated = await pool.query("UPDATE handles.reports SET dismissed_at = now() WHERE handle_id = $1 AND dismissed_at IS NULL", [handleId]);
  return (updated.rowCount ?? 0) > 0;
}
