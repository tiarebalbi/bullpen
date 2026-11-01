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

export type Submitted = { ok: true; handleId: string } | { ok: false; reason: "taken" };

const UNIQUE_VIOLATION = "23505";

/**
 * Saves a new or changed handle as 'pending' and drops any queue entry the old one had, in one statement. A handle already held by another player, ignoring case,
 * is refused with 'taken'. The same player saving the same handle again is allowed: it puts the handle back to 'pending', which is how a decision that never
 * arrived is retried. Nothing here decides anything.
 */
export async function submitHandle(pool: Pool, userId: string, handle: string): Promise<Submitted> {
  try {
    const { rows } = await pool.query<{ handle_id: string }>(
      `INSERT INTO handles.handle (owner_user_id, handle, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (owner_user_id) DO UPDATE
         SET handle = EXCLUDED.handle, status = 'pending', probability = NULL, submitted_at = now(), decided_at = NULL
       RETURNING handle_id`,
      [userId, handle],
    );
    await pool.query("DELETE FROM handles.review_queue WHERE handle_id = $1", [rows[0]!.handle_id]);
    return { ok: true, handleId: rows[0]!.handle_id };
  } catch (error) {
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw error;
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

/** A person's decision on a handle in review. False when it is no longer in review (decided already, or changed by the player). */
export async function resolveReview(pool: Pool, handleId: string, action: "approve" | "reject"): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query("UPDATE handles.handle SET status = $2, decided_at = now() WHERE handle_id = $1 AND status = 'review'", [handleId, action === "approve" ? "approved" : "rejected"]);
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
