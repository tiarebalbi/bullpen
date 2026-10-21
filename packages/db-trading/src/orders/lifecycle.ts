import type { Pool, PoolClient } from "pg";
import { BuyRefused } from "../buy.js";
import { fillBucket, stateAfterFill, type OrderState } from "./states.js";

/** The ceiling over the accept-time price that an order reserves for (ADR-0017): 5 %. */
export const CAP_MARGIN = "1.05";
/** The simulator's bound on how late a fill is delivered after it executed; a reservation is not released before this has passed. */
export const LATE_FILL_WINDOW_MS = 30_000;

/** Where a test can stop a step: before a boundary inside the transaction (it rolls back), or after the commit (the caller never hears). */
export type Boundary =
  | "submit:after-reserve" | "submit:after-order" | "submit:after-commit"
  | "fill:after-fill-row" | "fill:after-ledger" | "fill:before-commit" | "fill:after-commit"
  | "cancel:before-commit" | "cancel:after-commit"
  | "release:before-update" | "release:after-commit";
export interface Hooks {
  at?: (boundary: Boundary) => void | Promise<void>;
}

/** What a test throws from a hook to stand for a process dying there. */
export class CrashError extends Error {
  constructor(readonly boundary: string) {
    super(`crash at ${boundary}`);
    this.name = "CrashError";
  }
}

/** The order moved under a step that had read it: the step starts again from a fresh read. */
class VersionConflict extends Error {}
/** A fill that cannot be booked; it is stored, unbooked, with the reason, and the order is flagged. */
class Unbookable extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const RETRYABLE = new Set(["40001", "40P01"]);

async function inTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>, attempts = 12): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const retry = error instanceof VersionConflict || RETRYABLE.has((error as { code?: string }).code ?? "");
      if (!(retry && attempt < attempts)) throw error;
    } finally {
      client.release();
    }
  }
}

const event = (client: PoolClient, orderId: string, kind: string, fromState: string | null, toState: string | null, detail: object = {}) =>
  client.query("INSERT INTO trading.order_events (order_id, kind, from_state, to_state, detail) VALUES ($1, $2, $3, $4, $5)", [orderId, kind, fromState, toState, JSON.stringify(detail)]);

interface OrderRow {
  account_id: string;
  symbol: string;
  status: OrderState;
  version: number;
  open_qty: string;
  cancelled_qty: string;
  cancel_effective_at: Date | null;
  cancel_requested_at: Date | null;
}
const readOrder = async (client: PoolClient, orderId: string): Promise<OrderRow> => {
  const { rows } = await client.query<OrderRow>(
    "SELECT account_id, symbol, status, version, open_qty::text, cancelled_qty::text, cancel_effective_at, cancel_requested_at FROM trading.orders WHERE order_id = $1",
    [orderId],
  );
  if (!rows[0]) throw new Error(`unknown order ${orderId}`);
  return rows[0];
};

// ---- submit -------------------------------------------------------------------------------------------------------

export interface SubmitOrder {
  accountId: string;
  symbol: string;
  /** A decimal string. */
  quantity: string;
  /** The caller's key for this order: a retry with the same key returns the same order. */
  clientOrderId: string;
}
export interface Submitted {
  orderId: string;
  state: OrderState;
  reserved: string;
  capPrice: string;
  duplicate: boolean;
}

/** Accept: reserve buying power at the price ceiling and insert the order and its reservation, one transaction. */
export async function submitOrder(pool: Pool, order: SubmitOrder, hooks: Hooks = {}): Promise<Submitted> {
  const run = () =>
    inTx(pool, async (client): Promise<Submitted> => {
      const existing = await client.query<{ order_id: string; status: OrderState; cap_price: string; reserved: string }>(
        `SELECT o.order_id, o.status, o.cap_price::text, r.reserved::text
           FROM trading.orders o JOIN trading.reservations r USING (order_id)
          WHERE o.account_id = $1 AND o.client_order_id = $2`,
        [order.accountId, order.clientOrderId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        return { orderId: row.order_id, state: row.status, reserved: row.reserved, capPrice: row.cap_price, duplicate: true };
      }

      const priced = await client.query<{ price: string; as_of: Date; stale: boolean }>("SELECT price::text, as_of, stale FROM market_data.prices_v1 WHERE symbol = $1", [order.symbol]);
      const quote = priced.rows[0];
      if (!quote) throw new BuyRefused("no-price", `Refused: there is no price for ${order.symbol} yet.`);
      if (quote.stale) throw new BuyRefused("stale-price", `Refused: the latest price for ${order.symbol} is stale (as of ${quote.as_of.toISOString()}).`);

      const reserved = await client.query<{ cap: string; cost: string }>(
        `WITH c AS (SELECT round($3::numeric * $4::numeric, 8) AS cap, round($3::numeric * $4::numeric, 8) * $2::numeric AS cost)
         UPDATE trading.accounts AS a SET buying_power = a.buying_power - c.cost
           FROM c WHERE a.account_id = $1 AND a.buying_power >= c.cost
       RETURNING c.cap::text, c.cost::text`,
        [order.accountId, order.quantity, quote.price, CAP_MARGIN],
      );
      const held = reserved.rows[0];
      if (!held) {
        const known = await client.query("SELECT 1 FROM trading.accounts WHERE account_id = $1", [order.accountId]);
        throw known.rowCount === 0
          ? new BuyRefused("unknown-account", "Refused: that account does not exist.")
          : new BuyRefused("insufficient-buying-power", `Refused: not enough buying power for ${order.quantity} ${order.symbol}.`);
      }
      await hooks.at?.("submit:after-reserve");

      const inserted = await client.query<{ order_id: string }>(
        `INSERT INTO trading.orders (account_id, symbol, side, quantity, status, open_qty, cap_price, client_order_id)
         VALUES ($1, $2, 'buy', $3, 'accepted', $3, $4, $5) RETURNING order_id`,
        [order.accountId, order.symbol, order.quantity, held.cap, order.clientOrderId],
      );
      const orderId = inserted.rows[0]!.order_id;
      await client.query("INSERT INTO trading.reservations (order_id, account_id, reserved) VALUES ($1, $2, $3)", [orderId, order.accountId, held.cost]);
      await event(client, orderId, "accepted", null, "accepted", { quantity: order.quantity, capPrice: held.cap, reserved: held.cost });
      await hooks.at?.("submit:after-order");
      return { orderId, state: "accepted", reserved: held.cost, capPrice: held.cap, duplicate: false };
    });

  let result: Submitted;
  try {
    result = await run();
  } catch (error) {
    // Two concurrent submits with one key: the second hits the unique index and finds the first on its next read.
    if ((error as { code?: string }).code !== "23505") throw error;
    result = await run();
  }
  await hooks.at?.("submit:after-commit");
  return result;
}

/** accepted -> working: the venue has the order. Conditional on the state, so a repeat or a late call changes nothing. */
export async function markWorking(pool: Pool, orderId: string): Promise<boolean> {
  return inTx(pool, async (client) => {
    const moved = await client.query("UPDATE trading.orders SET status = 'working', version = version + 1, updated_at = now() WHERE order_id = $1 AND status = 'accepted'", [orderId]);
    if (moved.rowCount) await event(client, orderId, "working", "accepted", "working");
    return (moved.rowCount ?? 0) > 0;
  });
}

// ---- fills --------------------------------------------------------------------------------------------------------

export interface FillEvent {
  /** Unique per fill, assigned by the venue. A second delivery carries the same id. */
  fillId: string;
  orderId: string;
  quantity: string;
  price: string;
  /** When the venue executed it, on the venue's clock. */
  executedAt: Date;
}
export type FillOutcome = { outcome: "booked" | "duplicate" | "anomaly"; state: OrderState; reason?: string };

async function recordAnomaly(pool: Pool, fill: FillEvent, reason: string): Promise<FillOutcome> {
  return inTx(pool, async (client) => {
    const order = await readOrder(client, fill.orderId);
    const stored = await client.query(
      `INSERT INTO trading.fills (fill_id, order_id, account_id, symbol, quantity, price, executed_at, booked, anomaly)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8) ON CONFLICT (fill_id) DO NOTHING`,
      [fill.fillId, fill.orderId, order.account_id, order.symbol, fill.quantity, fill.price, fill.executedAt, reason],
    );
    if (stored.rowCount) {
      const flagged = await client.query("UPDATE trading.orders SET needs_attention = $2, version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $3", [fill.orderId, reason, order.version]);
      if (!flagged.rowCount) throw new VersionConflict();
      await event(client, fill.orderId, "fill_anomaly", order.status, order.status, { fillId: fill.fillId, reason, quantity: fill.quantity });
    }
    return { outcome: "anomaly" as const, state: order.status, reason };
  });
}

/**
 * Book one fill, or recognise it as a repeat. One transaction: the fill row (unique id), the order's quantities and
 * state (conditional on its version), the reservation, the ledger entries and the position. A fill that fails a rule
 * of ADR-0017 is stored unbooked and flags the order; it is never booked into a negative balance.
 */
export async function bookFill(pool: Pool, fill: FillEvent, hooks: Hooks = {}): Promise<FillOutcome> {
  let outcome: FillOutcome;
  try {
    outcome = await inTx(pool, async (client): Promise<FillOutcome> => {
      const { rows } = await client.query<OrderRow & { open_after: string; cancelled_after: string; fits_open: boolean; fits_cancelled: boolean }>(
        `SELECT account_id, symbol, status, version, open_qty::text, cancelled_qty::text, cancel_effective_at, cancel_requested_at,
                (open_qty - $2::numeric)::text AS open_after, (cancelled_qty - $2::numeric)::text AS cancelled_after,
                ($2::numeric <= open_qty) AS fits_open, ($2::numeric <= cancelled_qty) AS fits_cancelled
           FROM trading.orders WHERE order_id = $1`,
        [fill.orderId, fill.quantity],
      );
      const order = rows[0];
      if (!order) throw new Error(`unknown order ${fill.orderId}`);

      const inserted = await client.query(
        `INSERT INTO trading.fills (fill_id, order_id, account_id, symbol, quantity, price, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (fill_id) DO NOTHING`,
        [fill.fillId, fill.orderId, order.account_id, order.symbol, fill.quantity, fill.price, fill.executedAt],
      );
      if (!inserted.rowCount) return { outcome: "duplicate", state: order.status };
      await hooks.at?.("fill:after-fill-row");

      const bucket = fillBucket(order.status);
      if (!bucket) throw new Unbookable("order-is-terminal");
      if (order.cancel_effective_at && fill.executedAt >= order.cancel_effective_at) throw new Unbookable("executed-after-cancel-effective");
      if (!(bucket === "open" ? order.fits_open : order.fits_cancelled)) throw new Unbookable("exceeds-quantity");

      const next = stateAfterFill(order.status, { open: Number(bucket === "open" ? order.open_after : order.open_qty), cancelled: Number(bucket === "cancelled" ? order.cancelled_after : order.cancelled_qty) });
      const moved = await client.query(
        `UPDATE trading.orders
            SET filled_qty = filled_qty + $2::numeric,
                open_qty = open_qty - CASE WHEN $3 = 'open' THEN $2::numeric ELSE 0 END,
                cancelled_qty = cancelled_qty - CASE WHEN $3 = 'cancelled' THEN $2::numeric ELSE 0 END,
                status = $4, version = version + 1, updated_at = now()
          WHERE order_id = $1 AND version = $5`,
        [fill.orderId, fill.quantity, bucket, next, order.version],
      );
      if (!moved.rowCount) throw new VersionConflict();

      const spent = await client.query(
        `UPDATE trading.reservations SET spent = spent + $2::numeric * $3::numeric
          WHERE order_id = $1 AND released_at IS NULL AND spent + released + $2::numeric * $3::numeric <= reserved`,
        [fill.orderId, fill.quantity, fill.price],
      );
      if (!spent.rowCount) {
        // The reservation was already released (a late fill) or the cost passes it. Taking the money back is conditional too.
        const retaken = await client.query(
          `WITH take AS (UPDATE trading.accounts SET buying_power = buying_power - $3::numeric * $4::numeric
                          WHERE account_id = $2 AND buying_power >= $3::numeric * $4::numeric RETURNING 1)
           UPDATE trading.reservations SET reserved = reserved + $3::numeric * $4::numeric, spent = spent + $3::numeric * $4::numeric
            WHERE order_id = $1 AND released_at IS NOT NULL AND EXISTS (SELECT 1 FROM take)`,
          [fill.orderId, order.account_id, fill.quantity, fill.price],
        );
        if (!retaken.rowCount) throw new Unbookable("unfundable");
        await event(client, fill.orderId, "late_fill_refunded_from_buying_power", order.status, next, { fillId: fill.fillId });
      }

      await client.query(
        `INSERT INTO trading.ledger (order_id, account_id, asset, delta, fill_id)
         VALUES ($1, $2, 'USD', -($4::numeric * $5::numeric), $3), ($1, $2, $6, $4::numeric, $3)`,
        [fill.orderId, order.account_id, fill.fillId, fill.quantity, fill.price, order.symbol],
      );
      await hooks.at?.("fill:after-ledger");
      await client.query(
        `INSERT INTO trading.positions (account_id, symbol, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (account_id, symbol) DO UPDATE SET quantity = trading.positions.quantity + EXCLUDED.quantity`,
        [order.account_id, order.symbol, fill.quantity],
      );
      await event(client, fill.orderId, "fill", order.status, next, { fillId: fill.fillId, quantity: fill.quantity, price: fill.price, executedAt: fill.executedAt.toISOString() });
      await hooks.at?.("fill:before-commit");
      return { outcome: "booked", state: next };
    });
  } catch (error) {
    if (!(error instanceof Unbookable)) throw error;
    outcome = await recordAnomaly(pool, fill, error.reason);
  }
  await hooks.at?.("fill:after-commit");
  return outcome;
}

// ---- cancel -------------------------------------------------------------------------------------------------------

/** The player asks to cancel. Not a cancel: the order stays open for fills until the venue confirms with an effective time. */
export async function requestCancel(pool: Pool, orderId: string, at: Date, hooks: Hooks = {}): Promise<"requested" | "already" | "too-late"> {
  const outcome = await inTx(pool, async (client) => {
    const order = await readOrder(client, orderId);
    if (order.status === "cancel_requested" || order.status === "cancelled") return "already" as const;
    if (order.status === "filled" || order.status === "rejected") return "too-late" as const;
    const moved = await client.query(
      "UPDATE trading.orders SET status = 'cancel_requested', cancel_requested_at = $2, version = version + 1, updated_at = now() WHERE order_id = $1 AND version = $3",
      [orderId, at, order.version],
    );
    if (!moved.rowCount) throw new VersionConflict();
    await event(client, orderId, "cancel_requested", order.status, "cancel_requested", { at: at.toISOString() });
    await hooks.at?.("cancel:before-commit");
    return "requested" as const;
  });
  await hooks.at?.("cancel:after-commit");
  return outcome;
}

/** The venue confirms the cancel took effect at `effectiveAt`: what is still open becomes cancelled quantity. */
export async function confirmCancel(pool: Pool, orderId: string, effectiveAt: Date, hooks: Hooks = {}): Promise<"cancelled" | "already" | "ignored"> {
  const outcome = await inTx(pool, async (client) => {
    const order = await readOrder(client, orderId);
    if (order.status === "cancelled") return "already" as const;
    if (order.status !== "cancel_requested") return "ignored" as const;
    const late = await client.query<{ n: string }>("SELECT count(*) AS n FROM trading.fills WHERE order_id = $1 AND booked AND executed_at >= $2", [orderId, effectiveAt]);
    const flag = Number(late.rows[0]!.n) > 0 ? "fill-after-cancel-effective" : null;
    const moved = await client.query(
      `UPDATE trading.orders SET status = 'cancelled', cancelled_qty = open_qty, open_qty = 0, cancel_effective_at = $2,
              needs_attention = COALESCE($4, CASE WHEN needs_attention = 'cancel-unconfirmed' THEN NULL ELSE needs_attention END), version = version + 1, updated_at = now()
        WHERE order_id = $1 AND version = $3`,
      [orderId, effectiveAt, order.version, flag],
    );
    if (!moved.rowCount) throw new VersionConflict();
    await event(client, orderId, "cancelled", "cancel_requested", "cancelled", { effectiveAt: effectiveAt.toISOString(), cancelledQty: order.open_qty });
    return "cancelled" as const;
  });
  await hooks.at?.("cancel:after-commit");
  return outcome;
}

// ---- release (the compensation) -----------------------------------------------------------------------------------

export type ReleaseOutcome = { outcome: "released"; amount: string } | { outcome: "already" | "not-yet" };

/**
 * Give back what the reservation did not spend. One statement moves the money and marks the reservation, conditional
 * on it not having been released, so a repeat adds nothing. A cancelled order waits out the late-fill window first.
 */
export async function releaseReservation(pool: Pool, orderId: string, now: Date, hooks: Hooks = {}): Promise<ReleaseOutcome> {
  const outcome = await inTx(pool, async (client): Promise<ReleaseOutcome> => {
    const order = await readOrder(client, orderId);
    const settled =
      order.status === "filled" ||
      order.status === "rejected" ||
      (order.status === "cancelled" && order.cancel_effective_at !== null && now.getTime() >= order.cancel_effective_at.getTime() + LATE_FILL_WINDOW_MS);
    if (!settled) return { outcome: "not-yet" };
    await hooks.at?.("release:before-update");
    const released = await client.query<{ delta: string }>(
      `WITH r AS (UPDATE trading.reservations SET released = reserved - spent, released_at = $2
                   WHERE order_id = $1 AND released_at IS NULL RETURNING account_id, reserved - spent AS delta)
       UPDATE trading.accounts a SET buying_power = a.buying_power + r.delta FROM r WHERE a.account_id = r.account_id RETURNING r.delta::text`,
      [orderId, now],
    );
    if (!released.rows[0]) return { outcome: "already" };
    await client.query("UPDATE trading.orders SET needs_attention = NULL, updated_at = now() WHERE order_id = $1 AND needs_attention = 'release-failing'", [orderId]);
    await event(client, orderId, "released", order.status, order.status, { amount: released.rows[0].delta });
    return { outcome: "released", amount: released.rows[0].delta };
  });
  await hooks.at?.("release:after-commit");
  return outcome;
}

/** Counts a failed release outside the failed transaction; after `limit` failures the order is flagged for a person. */
export async function recordReleaseFailure(pool: Pool, orderId: string, error: unknown, limit: number): Promise<{ failures: number; flagged: boolean }> {
  const message = error instanceof Error ? error.message : String(error);
  return inTx(pool, async (client) => {
    const row = await client.query<{ release_failures: number }>(
      "UPDATE trading.reservations SET release_failures = release_failures + 1, last_release_error = $2 WHERE order_id = $1 RETURNING release_failures",
      [orderId, message.slice(0, 500)],
    );
    const failures = row.rows[0]?.release_failures ?? 0;
    const flagged = failures >= limit;
    if (flagged) await client.query("UPDATE trading.orders SET needs_attention = COALESCE(needs_attention, 'release-failing'), updated_at = now() WHERE order_id = $1", [orderId]);
    await event(client, orderId, "release_failed", null, null, { failures, flagged, error: message.slice(0, 200) });
    return { failures, flagged };
  });
}
