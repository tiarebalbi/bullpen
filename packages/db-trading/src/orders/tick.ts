import type { Pool } from "pg";
import { pump, sweep, type SweepResult } from "./sweep.js";
import type { Hooks } from "./lifecycle.js";
import type { Venue } from "./venue.js";

export interface TickResult {
  at: string;
  /**
   * Orders that need the fast cadence: not terminal, or terminal with a reservation not yet released, and not flagged. Zero lets the caller back off.
   * A flagged order (a release that kept failing, a cancel nobody confirmed) is still retried on every tick, but at the idle interval: it must not keep
   * the compute awake or spend the invocation quota at 5 s.
   */
  open: number;
  /** Open orders flagged for a person; they are not in `open`. */
  flagged: number;
  fills: number;
  cancels: number;
  placed: number;
  cancelRequested: number;
  released: number;
  releaseFailed: number;
  errors: number;
}

/** One pass of the lifecycle's background work: deliver what the venue has, then find what is stuck. Idempotent, and safe to kill at any point. */
export async function tick(pool: Pool, venue: Venue, now: Date, hooks: Hooks = {}): Promise<TickResult> {
  const delivered = await pump(pool, venue, now, hooks);
  const swept: SweepResult = await sweep(pool, venue, now, hooks);
  const { rows } = await pool.query<{ open: string; flagged: string }>(
    `SELECT count(*) FILTER (WHERE o.needs_attention IS NULL AND (o.status IN ('accepted', 'working', 'partially_filled', 'cancel_requested') OR r.released_at IS NULL)) AS open,
            count(*) FILTER (WHERE o.needs_attention IS NOT NULL AND (o.status IN ('accepted', 'working', 'partially_filled', 'cancel_requested') OR r.released_at IS NULL)) AS flagged
       FROM trading.orders o LEFT JOIN trading.reservations r USING (order_id)
      WHERE o.status IN ('accepted', 'working', 'partially_filled', 'cancel_requested') OR r.released_at IS NULL`,
  );
  return {
    at: now.toISOString(),
    open: Number(rows[0]!.open),
    flagged: Number(rows[0]!.flagged),
    fills: delivered.fills,
    cancels: delivered.cancels,
    placed: swept.placed,
    cancelRequested: swept.cancelRequested,
    released: swept.released,
    releaseFailed: swept.releaseFailed,
    errors: delivered.errors.length + swept.errors.length,
  };
}
