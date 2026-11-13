/**
 * The account poll (readAccountView, advanceAccount) runs every 3 s per open screen. Measured under load, it read the whole of orders, fills and reservations to find one
 * player's rows. These tests hold the fix: with a league's worth of history in the tables, the player's queries use an index on every big table.
 */
import { afterAll, describe, expect, inject, it } from "vitest";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());

interface PlanNode { "Node Type": string; "Relation Name"?: string; Plans?: PlanNode[] }
const nodes = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(nodes)];
async function seqScans(sql: string, params: unknown[]): Promise<string[]> {
  const { rows } = await w.trading.query<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  return nodes(rows[0]!["QUERY PLAN"][0].Plan).filter((n) => n["Node Type"] === "Seq Scan").map((n) => n["Relation Name"] ?? "?");
}

describe("the account poll's queries on a league with history", () => {
  it("scan no big table: every one is answered from an index", async () => {
    const accountId = await w.account("1000000");
    // 40 other players, 60 filled orders each, in bulk: enough that a sequential scan is the planner's wrong choice and an index is its right one.
    await w.trading.query(
      `WITH a AS (INSERT INTO trading.accounts (handle, buying_power) SELECT 'zz-test-hist-' || g, 0 FROM generate_series(1, 40) g RETURNING account_id),
            o AS (INSERT INTO trading.orders (account_id, symbol, side, quantity, status, filled_qty, open_qty, cap_price, client_order_id, created_at)
                  SELECT a.account_id, 'HIST', 'buy', 1, 'filled', 1, 0, 10, 'h' || s, now() - make_interval(mins => s) FROM a CROSS JOIN generate_series(1, 60) s RETURNING order_id, account_id, created_at),
            r AS (INSERT INTO trading.reservations (order_id, account_id, reserved, spent, released, released_at) SELECT order_id, account_id, 10, 9, 1, created_at FROM o RETURNING 1)
       INSERT INTO trading.fills (fill_id, order_id, account_id, symbol, quantity, price, executed_at) SELECT order_id::text || ':0', order_id, account_id, 'HIST', 1, 9, created_at FROM o`,
    );
    await w.trading.query("ANALYZE trading.orders; ANALYZE trading.fills; ANALYZE trading.reservations");
    const big = ["orders", "fills", "reservations"];
    const queries: [string, string][] = [
      ["the orders list", "SELECT o.order_id FROM trading.orders o JOIN trading.reservations r USING (order_id) WHERE o.account_id = $1 ORDER BY o.created_at DESC, o.order_id LIMIT 50"],
      ["the recent fills", "SELECT fill_id FROM trading.fills WHERE account_id = $1 AND booked ORDER BY executed_at DESC, fill_id LIMIT 10"],
      ["the reserved total", "SELECT COALESCE(sum(r.reserved - r.spent - r.released), 0) FROM trading.reservations r WHERE r.account_id = $1"],
      ["the average cost of a position", "SELECT sum(f.quantity * f.price) / sum(f.quantity) FROM trading.fills f WHERE f.account_id = $1 AND f.symbol = 'HIST' AND f.booked"],
      ["the player's accepted orders", "SELECT order_id FROM trading.orders WHERE account_id = $1 AND status = 'accepted'"],
    ];
    for (const [name, sql] of queries) {
      const scans = (await seqScans(sql, [accountId])).filter((relation) => big.includes(relation));
      expect(scans, `${name} must not scan ${big.join(", ")} sequentially`).toEqual([]);
    }
  });
});
