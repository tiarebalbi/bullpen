import type { Pool } from "pg";
import { releaseReservation, requestCancel, submitOrder, type SubmitOrder } from "./lifecycle.js";
import { dispatchOrder, pump } from "./sweep.js";
import { DerivedVenue, dbPriceSource } from "./venue.js";

/** The simulator's seed: a run of fills is reproducible from it. One value for the route the sweeper calls and for a player's own polls. */
export const SIMULATOR_SEED = 20261026;

/** From a cancel request to the venue's confirmation: long enough for a player's next poll to show "cancel requested" before it shows "cancelled". */
export const CANCEL_ACK_DELAY_MS = 3_000;

/** The simulated venue, the same for the sweep route and for a player's own polls (scoped to one account when given). */
export const createSimulatedVenue = (pool: Pool, accountId?: string): DerivedVenue => new DerivedVenue(pool, { seed: SIMULATOR_SEED, prices: dbPriceSource(pool), accountId, ackDelayMs: CANCEL_ACK_DELAY_MS });
const venueFor = createSimulatedVenue;

export interface AdvanceResult {
  placed: number;
  fills: number;
  cancels: number;
  released: number;
  errors: number;
}

/**
 * Moves one player's own orders along: hands accepted ones to the venue, delivers what the venue has for them, and releases what a finished
 * one did not spend. This is what a status poll runs (ADR-0018: the player's own requests move a healthy order; the sweeper finds what they did
 * not finish). Idempotent and conditional on each order's state, so two polls at once do no harm.
 */
export async function advanceAccount(pool: Pool, accountId: string, now: Date = new Date()): Promise<AdvanceResult> {
  const venue = venueFor(pool, accountId);
  const result: AdvanceResult = { placed: 0, fills: 0, cancels: 0, released: 0, errors: 0 };

  const accepted = await pool.query<{ order_id: string; symbol: string; quantity: string; cap_price: string }>(
    "SELECT order_id, symbol, quantity::text, cap_price::text FROM trading.orders WHERE account_id = $1 AND status = 'accepted'",
    [accountId],
  );
  for (const row of accepted.rows) {
    await dispatchOrder(pool, venue, { orderId: row.order_id, symbol: row.symbol, quantity: row.quantity, capPrice: row.cap_price }, now);
    result.placed += 1;
  }

  const delivered = await pump(pool, venue, now);
  result.fills = delivered.fills;
  result.cancels = delivered.cancels;
  result.errors += delivered.errors.length;

  const unreleased = await pool.query<{ order_id: string }>(
    `SELECT o.order_id FROM trading.orders o JOIN trading.reservations r USING (order_id)
      WHERE o.account_id = $1 AND r.released_at IS NULL AND o.status IN ('filled', 'rejected', 'cancelled')`,
    [accountId],
  );
  for (const row of unreleased.rows) {
    try {
      const released = await releaseReservation(pool, row.order_id, now);
      if (released.outcome === "released") result.released += 1;
    } catch {
      result.errors += 1; // the sweep counts the failure and flags the order; a player's poll just tries again next time
    }
  }
  return result;
}

export interface PlacedOrder {
  orderId: string;
  duplicate: boolean;
}

/** A player's market buy: accept and reserve (idempotent by the client's key), hand it to the venue, and run one advance so a fill shows at once. */
export async function placePlayerOrder(pool: Pool, accountId: string, order: Omit<SubmitOrder, "accountId">, now: Date = new Date()): Promise<PlacedOrder> {
  const submitted = await submitOrder(pool, { ...order, accountId });
  await advanceAccount(pool, accountId, now);
  return { orderId: submitted.orderId, duplicate: submitted.duplicate };
}

/** A player's cancel request on their own order: "requested", "already", "too-late", or "not-found" for an order that is not theirs. */
export async function cancelPlayerOrder(pool: Pool, accountId: string, orderId: string, now: Date = new Date()): Promise<"requested" | "already" | "too-late" | "not-found"> {
  const owned = await pool.query("SELECT 1 FROM trading.orders WHERE order_id = $1 AND account_id = $2", [orderId, accountId]);
  if (owned.rowCount === 0) return "not-found";
  const outcome = await requestCancel(pool, orderId, now);
  await advanceAccount(pool, accountId, now);
  return outcome;
}
