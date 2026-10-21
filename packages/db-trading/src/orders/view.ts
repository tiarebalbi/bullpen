import type { Pool } from "pg";
import type { OrderState } from "./states.js";

/** What a screen needs about one order. Decimal strings throughout; no account id, no user id, nothing that names a person. */
export interface OrderRow {
  orderId: string;
  symbol: string;
  side: "buy";
  type: "market";
  state: OrderState;
  quantity: string;
  filledQty: string;
  openQty: string;
  cancelledQty: string;
  /** Volume-weighted price of the booked fills, or null before the first. */
  avgPrice: string | null;
  /** The ceiling the order reserved at, per unit. */
  capPrice: string;
  reserved: string;
  spent: string;
  /** What has been given back to buying power. */
  released: string;
  /** True once a finished order's reservation has been released. */
  releaseDone: boolean;
  needsAttention: string | null;
  createdAt: string;
  cancelRequestedAt: string | null;
}

export interface PositionRow {
  symbol: string;
  quantity: string;
  price: string | null;
  value: string | null;
}

export interface AccountView {
  /** The neutral label ("Player 4F2A"). */
  label: string;
  /** Available now. */
  buyingPower: string;
  /** Held by open orders and not yet spent or released. */
  reserved: string;
  /** Available plus reserved: what the leaderboard counts (ADR-0019). */
  cash: string;
  positionsValue: string;
  equity: string;
  positions: PositionRow[];
  orders: OrderRow[];
  asOf: string;
}

export const ORDERS_SHOWN = 50;

/** The player's account as a screen shows it, from the tables. Valued at the price contract; a symbol with no price has no value, not a made-up one. */
export async function readAccountView(pool: Pool, accountId: string, now: Date = new Date()): Promise<AccountView | null> {
  const account = await pool.query<{ handle: string; buying_power: string; reserved: string }>(
    `SELECT a.handle, a.buying_power::text,
            COALESCE((SELECT sum(r.reserved - r.spent - r.released) FROM trading.reservations r WHERE r.account_id = a.account_id), 0)::text AS reserved
       FROM trading.accounts a WHERE a.account_id = $1`,
    [accountId],
  );
  const head = account.rows[0];
  if (!head) return null;

  const positions = await pool.query<{ symbol: string; quantity: string; price: string | null; value: string | null }>(
    `SELECT p.symbol, p.quantity::text, pr.price::text AS price, (p.quantity * pr.price)::numeric(20,8)::text AS value
       FROM trading.positions p LEFT JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol
      WHERE p.account_id = $1 AND p.quantity > 0 ORDER BY p.symbol`,
    [accountId],
  );
  const orders = await pool.query<{
    order_id: string; symbol: string; status: OrderState; quantity: string; filled_qty: string; open_qty: string; cancelled_qty: string; avg_price: string | null; cap_price: string;
    reserved: string; spent: string; released: string; released_at: Date | null; needs_attention: string | null; created_at: Date; cancel_requested_at: Date | null;
  }>(
    `SELECT o.order_id, o.symbol, o.status, o.quantity::text, o.filled_qty::text, o.open_qty::text, o.cancelled_qty::text, o.cap_price::text,
            (SELECT (sum(f.quantity * f.price) / sum(f.quantity))::numeric(20,8)::text FROM trading.fills f WHERE f.order_id = o.order_id AND f.booked) AS avg_price,
            r.reserved::text, r.spent::text, r.released::text, r.released_at, o.needs_attention, o.created_at, o.cancel_requested_at
       FROM trading.orders o JOIN trading.reservations r USING (order_id)
      WHERE o.account_id = $1 ORDER BY o.created_at DESC, o.order_id LIMIT ${ORDERS_SHOWN}`,
    [accountId],
  );

  const sums = await pool.query<{ cash: string; positions_value: string; equity: string }>(
    `SELECT ($1::numeric + $2::numeric)::text AS cash,
            COALESCE((SELECT sum(p.quantity * pr.price) FROM trading.positions p JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol WHERE p.account_id = $3), 0)::numeric(20,8)::text AS positions_value,
            ($1::numeric + $2::numeric + COALESCE((SELECT sum(p.quantity * pr.price) FROM trading.positions p JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol WHERE p.account_id = $3), 0))::numeric(20,8)::text AS equity`,
    [head.buying_power, head.reserved, accountId],
  );
  const total = sums.rows[0]!;
  return {
    label: head.handle,
    buyingPower: head.buying_power,
    reserved: head.reserved,
    cash: total.cash,
    positionsValue: total.positions_value,
    equity: total.equity,
    positions: positions.rows.map((p) => ({ symbol: p.symbol, quantity: p.quantity, price: p.price, value: p.value })),
    orders: orders.rows.map((o) => ({
      orderId: o.order_id,
      symbol: o.symbol,
      side: "buy",
      type: "market",
      state: o.status,
      quantity: o.quantity,
      filledQty: o.filled_qty,
      openQty: o.open_qty,
      cancelledQty: o.cancelled_qty,
      avgPrice: o.avg_price,
      capPrice: o.cap_price,
      reserved: o.reserved,
      spent: o.spent,
      released: o.released,
      releaseDone: o.released_at !== null,
      needsAttention: o.needs_attention,
      createdAt: o.created_at.toISOString(),
      cancelRequestedAt: o.cancel_requested_at ? o.cancel_requested_at.toISOString() : null,
    })),
    asOf: now.toISOString(),
  };
}
