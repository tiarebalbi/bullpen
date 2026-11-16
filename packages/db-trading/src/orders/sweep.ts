import type { Pool } from "pg";
import { isMarketOpen } from "@bullpen/contracts";
import { CrashError, admitQueuedOrder, bookFill, confirmCancel, markWorking, recordReleaseFailure, rejectOrder, releaseReservation, requestCancel, type Hooks } from "./lifecycle.js";
import type { Venue } from "./venue.js";

export const ACCEPT_TIMEOUT_MS = 30_000;
/** A working order that has seen no fill for this long is cancelled: it has no fillable price. */
export const WORKING_DEADLINE_MS = 15 * 60_000;
export const CANCEL_RESEND_MS = 10_000;
export const CANCEL_STUCK_MS = 5 * 60_000;
export const MAX_RELEASE_FAILURES = 3;
/**
 * The opening makes the backlog eligible; it does not execute it all at 9:30:00 (ADR-0028). Each sweep pass admits at most this many queued orders, oldest first.
 * At the sweeper's 5 s cadence that is 20 orders a second, so 1,000 queued orders are all admitted in 50 s. Chosen from the cost of an admission (one short
 * transaction and one dispatch, measured in post-facts/part-05.md) so that a pass is far shorter than the cadence on the smallest compute.
 */
export const ADMIT_BATCH_SIZE = 100;
/** A pass stops starting admissions after this long, so a slow database makes a short batch, not a request that outlives the sweeper's timeout (20 s). */
export const ADMIT_BUDGET_MS = 8_000;

export interface SweepOptions {
  batchSize?: number;
  budgetMs?: number;
  /** Milliseconds now; a test passes a slow one. */
  clock?: () => number;
  /** Whether the market is open at an instant. The calendar's answer by default; a test whose database clock is the real one passes its own. */
  isOpen?: (at: Date) => boolean;
}

export interface SweepResult {
  placed: number;
  cancelRequested: number;
  cancelResent: number;
  released: number;
  releaseFailed: number;
  flagged: number;
  admitted: number;
  toppedUp: number;
  admissionRejected: number;
  errors: string[];
}

/** Hand one accepted order to the venue and mark it working. Both are idempotent, so the sweep may run this again after a crash between them. */
export async function dispatchOrder(pool: Pool, venue: Venue, order: { orderId: string; symbol: string; quantity: string; capPrice: string }, now: Date): Promise<void> {
  const placed = await venue.place(order, now);
  if (placed && "refused" in placed) await rejectOrder(pool, order.orderId, placed.refused);
  else await markWorking(pool, order.orderId);
}

/** Delivers what the venue has: books each fill, applies each cancel confirmation. A repeat of either changes nothing. */
export async function pump(pool: Pool, venue: Venue, now: Date, hooks: Hooks = {}): Promise<{ fills: number; cancels: number; errors: string[] }> {
  const summary = { fills: 0, cancels: 0, errors: [] as string[] };
  for (const event of await venue.poll(now)) {
    try {
      if (event.kind === "fill") {
        const result = await bookFill(pool, event.fill, hooks);
        if (result.outcome === "booked") summary.fills += 1;
      } else {
        const result = await confirmCancel(pool, event.orderId, event.effectiveAt, hooks);
        if (result === "cancelled") summary.cancels += 1;
      }
    } catch (error) {
      if (error instanceof CrashError) throw error;
      summary.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return summary;
}

/**
 * Finds what is stuck and moves it on or flags it. Every step it takes is idempotent and conditional on the order's
 * state, so it can be killed at any point and run again, and two sweeps at once do no harm.
 */
export async function sweep(pool: Pool, venue: Venue, now: Date, hooks: Hooks = {}, options: SweepOptions = {}): Promise<SweepResult> {
  const result: SweepResult = { placed: 0, cancelRequested: 0, cancelResent: 0, released: 0, releaseFailed: 0, flagged: 0, admitted: 0, toppedUp: 0, admissionRejected: 0, errors: [] };
  const guard = async (work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      if (error instanceof CrashError) throw error;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  };
  const ago = (ms: number): Date => new Date(now.getTime() - ms);

  // The queue for the open: only while the market is open, and one batch a pass, oldest first (ADR-0028).
  const isOpen = options.isOpen ?? isMarketOpen;
  if (isOpen(now)) {
    const clock = options.clock ?? Date.now;
    const started = clock();
    const budgetMs = options.budgetMs ?? ADMIT_BUDGET_MS;
    const queued = await pool.query<{ order_id: string; symbol: string; quantity: string }>(
      "SELECT order_id, symbol, quantity::text FROM trading.orders WHERE status = 'queued_for_open' ORDER BY created_at, order_id LIMIT $1",
      [options.batchSize ?? ADMIT_BATCH_SIZE],
    );
    for (const row of queued.rows) {
      if (clock() - started >= budgetMs) break;
      await guard(async () => {
        const admitted = await admitQueuedOrder(pool, row.order_id, now, hooks, isOpen);
        if (admitted.outcome === "rejected") result.admissionRejected += 1;
        if (admitted.outcome !== "admitted") return;
        result.admitted += 1;
        if (admitted.toppedUp !== null) result.toppedUp += 1;
        // Hand it to the venue now; if the pass dies here, the accepted-order step below finds it after ACCEPT_TIMEOUT_MS.
        await dispatchOrder(pool, venue, { orderId: row.order_id, symbol: row.symbol, quantity: row.quantity, capPrice: admitted.capPrice }, now);
        result.placed += 1;
      });
    }
  }

  const accepted = await pool.query<{ order_id: string; symbol: string; quantity: string; cap_price: string }>(
    "SELECT order_id, symbol, quantity::text, cap_price::text FROM trading.orders WHERE status = 'accepted' AND updated_at < $1 ORDER BY updated_at LIMIT 100",
    [ago(ACCEPT_TIMEOUT_MS)],
  );
  for (const row of accepted.rows) {
    await guard(async () => {
      await dispatchOrder(pool, venue, { orderId: row.order_id, symbol: row.symbol, quantity: row.quantity, capPrice: row.cap_price }, now);
      result.placed += 1;
    });
  }

  const idle = await pool.query<{ order_id: string }>("SELECT order_id FROM trading.orders WHERE status IN ('working', 'partially_filled') AND updated_at < $1 ORDER BY updated_at LIMIT 100", [ago(WORKING_DEADLINE_MS)]);
  for (const row of idle.rows) {
    await guard(async () => {
      if ((await requestCancel(pool, row.order_id, now, hooks)) === "requested") {
        await venue.cancel(row.order_id, now);
        result.cancelRequested += 1;
      }
    });
  }

  const cancelling = await pool.query<{ order_id: string; cancel_requested_at: Date }>(
    "SELECT order_id, cancel_requested_at FROM trading.orders WHERE status = 'cancel_requested' AND cancel_requested_at < $1 ORDER BY cancel_requested_at LIMIT 100",
    [ago(CANCEL_RESEND_MS)],
  );
  for (const row of cancelling.rows) {
    await guard(async () => {
      await venue.cancel(row.order_id, now);
      result.cancelResent += 1;
      if (row.cancel_requested_at < ago(CANCEL_STUCK_MS)) {
        const flagged = await pool.query("UPDATE trading.orders SET needs_attention = 'cancel-unconfirmed', updated_at = now() WHERE order_id = $1 AND needs_attention IS NULL", [row.order_id]);
        result.flagged += flagged.rowCount ?? 0;
      }
    });
  }

  const unreleased = await pool.query<{ order_id: string }>(
    `SELECT o.order_id FROM trading.orders o JOIN trading.reservations r USING (order_id)
      WHERE r.released_at IS NULL AND o.status IN ('filled', 'rejected', 'cancelled') ORDER BY o.updated_at LIMIT 100`,
  );
  for (const row of unreleased.rows) {
    await guard(async () => {
      try {
        const released = await releaseReservation(pool, row.order_id, now, hooks);
        if (released.outcome === "released") result.released += 1;
      } catch (error) {
        if (error instanceof CrashError) throw error;
        const failure = await recordReleaseFailure(pool, row.order_id, error, MAX_RELEASE_FAILURES);
        result.releaseFailed += 1;
        if (failure.flagged && failure.failures === MAX_RELEASE_FAILURES) result.flagged += 1;
      }
    });
  }
  return result;
}
