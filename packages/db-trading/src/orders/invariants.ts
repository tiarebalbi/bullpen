import type { Pool } from "pg";
import { LEADERBOARD_ON_READ_SQL } from "../leaderboard.js";

export interface AccountStart {
  accountId: string;
  /** What the account held before any order, as a decimal string. */
  startingCash: string;
}

/**
 * The invariants of ADR-0017, read from the tables. Empty means they all hold for these accounts:
 * buying power never negative; available + still-reserved + spent = starting cash; filled + open + cancelled = ordered;
 * each order's filled quantity is the sum of its booked fills; positions are the sum of what the ledger booked; each
 * reservation's spent is what the ledger took for that order.
 */
export async function checkOrderInvariants(pool: Pool, accounts: readonly AccountStart[]): Promise<string[]> {
  const ids = accounts.map((a) => a.accountId);
  const cash = accounts.map((a) => a.startingCash);
  const problems: string[] = [];
  const rows = async (sql: string): Promise<Record<string, string>[]> => (await pool.query<Record<string, string>>(sql, sql.includes("$2") ? [ids, cash] : [ids])).rows;

  for (const r of await rows("SELECT account_id, buying_power::text AS v FROM trading.accounts WHERE account_id = ANY($1::uuid[]) AND buying_power < 0")) {
    problems.push(`buying power is negative for ${r.account_id}: ${r.v}`);
  }

  for (const r of await rows(
    `SELECT a.account_id, a.buying_power::text AS available,
            COALESCE((SELECT sum(reserved - spent - released) FROM trading.reservations x WHERE x.account_id = a.account_id), 0)::text AS reserved,
            (-COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = a.account_id AND l.asset = 'USD'), 0))::text AS spent,
            s.cash::text AS starting
       FROM trading.accounts a JOIN unnest($1::uuid[], $2::numeric[]) AS s(id, cash) ON s.id = a.account_id
      WHERE a.buying_power + COALESCE((SELECT sum(reserved - spent - released) FROM trading.reservations x WHERE x.account_id = a.account_id), 0)
            - COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = a.account_id AND l.asset = 'USD'), 0) <> s.cash`,
  )) {
    problems.push(`cash does not add up for ${r.account_id}: available ${r.available} + reserved ${r.reserved} + spent ${r.spent} <> starting ${r.starting}`);
  }

  for (const r of await rows("SELECT order_id, quantity::text AS q, filled_qty::text AS f, open_qty::text AS o, cancelled_qty::text AS c FROM trading.orders WHERE account_id = ANY($1::uuid[]) AND filled_qty + open_qty + cancelled_qty <> quantity")) {
    problems.push(`quantities do not add up for order ${r.order_id}: filled ${r.f} + open ${r.o} + cancelled ${r.c} <> ${r.q}`);
  }

  for (const r of await rows(
    `SELECT o.order_id, o.filled_qty::text AS filled, COALESCE(sum(f.quantity), 0)::text AS booked
       FROM trading.orders o JOIN trading.reservations res USING (order_id)
       LEFT JOIN trading.fills f ON f.order_id = o.order_id AND f.booked
      WHERE o.account_id = ANY($1::uuid[]) GROUP BY o.order_id, o.filled_qty HAVING o.filled_qty <> COALESCE(sum(f.quantity), 0)`,
  )) {
    problems.push(`order ${r.order_id} shows ${r.filled} filled but its booked fills add up to ${r.booked}`);
  }

  for (const r of await rows(
    `SELECT p.account_id, p.symbol, p.quantity::text AS position,
            COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = p.account_id AND l.asset = p.symbol), 0)::text AS ledger
       FROM trading.positions p WHERE p.account_id = ANY($1::uuid[])
        AND p.quantity <> COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = p.account_id AND l.asset = p.symbol), 0)`,
  )) {
    problems.push(`position ${r.account_id}/${r.symbol} is ${r.position} but the ledger booked ${r.ledger}`);
  }

  for (const r of await rows(
    `SELECT res.order_id, res.spent::text AS spent, (-COALESCE(sum(l.delta), 0))::text AS ledger
       FROM trading.reservations res LEFT JOIN trading.ledger l ON l.order_id = res.order_id AND l.asset = 'USD'
      WHERE res.account_id = ANY($1::uuid[]) GROUP BY res.order_id, res.spent HAVING res.spent <> -COALESCE(sum(l.delta), 0)`,
  )) {
    problems.push(`reservation ${r.order_id} says ${r.spent} spent but the ledger took ${r.ledger}`);
  }
  return problems;
}

/**
 * ADR-0019: the ranking's cash counts money held by open orders, so an account's equity moves only when a fill is booked
 * or a price changes, never when a reservation is made or released. Read from the same query the view is built from:
 * cash = available + still-reserved, and equity = starting cash - spent + positions at the price contract.
 */
export async function checkEquityInvariant(pool: Pool, accounts: readonly AccountStart[]): Promise<string[]> {
  const { rows } = await pool.query<{ account_id: string; cash: string; equity: string; expected_cash: string; expected_equity: string }>(
    `SELECT l.account_id, l.cash::text, l.equity::text,
            (a.buying_power + COALESCE((SELECT sum(reserved - spent - released) FROM trading.reservations x WHERE x.account_id = a.account_id), 0))::text AS expected_cash,
            (s.cash - COALESCE(-(SELECT sum(delta) FROM trading.ledger g WHERE g.account_id = a.account_id AND g.asset = 'USD'), 0) + l.positions_value)::text AS expected_equity
       FROM (${LEADERBOARD_ON_READ_SQL}) l
       JOIN trading.accounts a ON a.account_id = l.account_id
       JOIN unnest($1::uuid[], $2::numeric[]) AS s(id, cash) ON s.id = l.account_id
      WHERE l.cash <> a.buying_power + COALESCE((SELECT sum(reserved - spent - released) FROM trading.reservations x WHERE x.account_id = a.account_id), 0)
         OR l.equity <> s.cash - COALESCE(-(SELECT sum(delta) FROM trading.ledger g WHERE g.account_id = a.account_id AND g.asset = 'USD'), 0) + l.positions_value`,
    [accounts.map((a) => a.accountId), accounts.map((a) => a.startingCash)],
  );
  return rows.map((r) => `leaderboard for ${r.account_id}: cash ${r.cash} (expected ${r.expected_cash}), equity ${r.equity} (expected ${r.expected_equity})`);
}
