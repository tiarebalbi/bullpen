/**
 * The tick the sweeper drives (ADR-0018) with a venue that remembers nothing between calls. Includes the crash test of the
 * baseline, independent of Workflows: a tick that dies mid-run, and the next tick finishing the work with no duplicate effect.
 */
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import { CrashError, DerivedVenue, LATE_FILL_WINDOW_MS, bookFill, confirmCancel, dbPriceSource, markWorking, requestCancel, submitOrder, tick, type Boundary, type Hooks } from "@bullpen/db-trading";
import { validateSweepTick } from "@bullpen/contracts";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
// A tick works on every open order in the database, so these tests start from an empty trading schema (the test database is throwaway).
beforeAll(() => w.trading.query("TRUNCATE trading.order_events, trading.fills, trading.reservations, trading.ledger, trading.positions, trading.orders, trading.accounts CASCADE"));
afterAll(() => w.close());
afterEach(() => w.assertInvariants());

const venue = (options: { partialRate?: number; seed?: number } = {}) => new DerivedVenue(w.trading, { seed: options.seed ?? 1, prices: dbPriceSource(w.marketData), partialRate: options.partialRate ?? 0 });

async function working(qty = "10") {
  const symbol = w.symbol();
  await w.price(symbol, "100");
  const accountId = await w.account("10000");
  const order = await submitOrder(w.trading, { accountId, symbol, quantity: qty, clientOrderId: `t-${symbol}` });
  await markWorking(w.trading, order.orderId);
  return { accountId, symbol, orderId: order.orderId };
}
const crashOnce = (boundary: Boundary): Hooks => {
  let fired = false;
  return { at: (b) => { if (b === boundary && !fired) { fired = true; throw new CrashError(b); } } };
};

describe("the tick", () => {
  it("answers in the shape the sweep contract says, with and without open orders (the contract between the lifecycle and the route)", async () => {
    expect(validateSweepTick(await tick(w.trading, venue(), new Date()))).toEqual({ valid: true, errors: null });
    await working();
    const busy = await tick(w.trading, venue(), new Date());
    expect(validateSweepTick(busy)).toEqual({ valid: true, errors: null });
  });

  it("fills a working order, releases the unused reservation in the same tick, and then has nothing open", async () => {
    const { accountId, orderId } = await working();
    const first = await tick(w.trading, venue(), new Date());
    expect(first).toMatchObject({ fills: 1, released: 1, errors: 0 });
    expect(await w.order(orderId)).toMatchObject({ status: "filled" });
    expect(await w.buyingPower(accountId)).toBe("9000.00000000");
    const again = await tick(w.trading, venue(), new Date());
    expect(again).toMatchObject({ fills: 0, released: 0, errors: 0 });
    expect(again.open).toBeGreaterThanOrEqual(0);
    expect(await w.count("fills", orderId)).toBe(1);
  });

  it("with every fill partial, takes several ticks, each fill has the id <order>:<n>, and the order ends filled", async () => {
    const { orderId } = await working("10");
    // each partial fill takes a random share of what is left, so a 10-share order at 8 decimals takes a few dozen ticks to run out
    for (let i = 0; i < 400; i += 1) {
      await tick(w.trading, venue({ partialRate: 1, seed: 5 }), new Date());
      if ((await w.order(orderId)).status === "filled") break;
    }
    expect(await w.order(orderId)).toMatchObject({ status: "filled", filled_qty: "10.00000000" });
    const ids = (await w.trading.query<{ fill_id: string }>("SELECT fill_id FROM trading.fills WHERE order_id = $1 ORDER BY executed_at, fill_id", [orderId])).rows.map((r) => r.fill_id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids)).toEqual(new Set(ids.map((_, n) => `${orderId}:${n}`)));
  });

  it("two ticks at once do no harm: one fill, one pair of ledger entries", async () => {
    const { orderId } = await working();
    await Promise.all([tick(w.trading, venue(), new Date()), tick(w.trading, venue(), new Date()), tick(w.trading, venue(), new Date())]);
    expect(await w.count("fills", orderId)).toBe(1);
    expect(await w.count("ledger", orderId)).toBe(2);
  });

  it("a cancel through the tick: confirmed by the venue, then released after the late-fill window", async () => {
    const { accountId, orderId } = await working();
    await w.price((await w.trading.query<{ symbol: string }>("SELECT symbol FROM trading.orders WHERE order_id = $1", [orderId])).rows[0]!.symbol, "110"); // above the 105 ceiling: it cannot fill
    const now = new Date();
    await requestCancel(w.trading, orderId, now);
    expect(await tick(w.trading, venue(), now)).toMatchObject({ cancels: 1, fills: 0 });
    expect(await w.order(orderId)).toMatchObject({ status: "cancelled", cancelled_qty: "10.00000000" });
    expect((await tick(w.trading, venue(), now)).released).toBe(0);
    expect(await tick(w.trading, venue(), new Date(now.getTime() + LATE_FILL_WINDOW_MS + 1))).toMatchObject({ released: 1 });
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
  });

  it("an order stuck in accepted is handed to the venue by a later tick", async () => {
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: `s-${symbol}` });
    expect(await tick(w.trading, venue(), new Date())).toMatchObject({ placed: 0 }); // too young: the request path may still be finishing it
    await w.trading.query("UPDATE trading.orders SET updated_at = now() - interval '2 minutes' WHERE order_id = $1", [order.orderId]);
    expect(await tick(w.trading, venue(), new Date())).toMatchObject({ placed: 1 });
    expect(await w.order(order.orderId)).toMatchObject({ status: "working" });
    await tick(w.trading, venue(), new Date());
    expect(await w.order(order.orderId)).toMatchObject({ status: "filled" });
  });
});

describe("a tick that dies mid-run", () => {
  it.each(["fill:after-fill-row", "fill:after-ledger", "fill:before-commit", "fill:after-commit", "release:after-commit"] as const)("dying at %s: the next tick completes the work with no duplicate effect", async (boundary) => {
    const { accountId, symbol, orderId } = await working();
    await expect(tick(w.trading, venue(), new Date(), crashOnce(boundary))).rejects.toBeInstanceOf(CrashError);
    const next = await tick(w.trading, venue(), new Date());
    expect(next.errors).toBe(0);
    expect(await w.order(orderId)).toMatchObject({ status: "filled", filled_qty: "10.00000000" });
    expect(await w.count("fills", orderId)).toBe(1);
    expect(await w.count("ledger", orderId)).toBe(2);
    expect(await w.position(accountId, symbol)).toBe("10.00000000");
    expect(await w.buyingPower(accountId)).toBe("9000.00000000");
    expect(await w.reservation(orderId)).toMatchObject({ spent: "1000.00000000", released: "50.00000000" });
  });
});

describe("after an outage: the daemon stopped for days (for example its Active CPU quota ran out)", () => {
  it("the first ticks afterwards recover every order, release what is held, and leave the account's books balanced and nothing flagged", async () => {
    const DAYS = "interval '3 days'";
    const make = async (qty = "10") => {
      const symbol = w.symbol();
      await w.price(symbol, "100");
      const accountId = await w.account("10000");
      const order = await submitOrder(w.trading, { accountId, symbol, quantity: qty, clientOrderId: `o-${symbol}` });
      return { accountId, symbol, orderId: order.orderId };
    };
    const aged = (orderId: string) => w.trading.query(`UPDATE trading.orders SET updated_at = now() - ${DAYS}, cancel_requested_at = CASE WHEN cancel_requested_at IS NULL THEN NULL ELSE now() - ${DAYS} END WHERE order_id = $1`, [orderId]);
    const hold = (symbol: string) => w.price(symbol, "110"); // above the 105 ceiling: it cannot fill

    // accepted and never handed to the venue
    const a = await make();
    await aged(a.orderId);
    // working with no fillable price, for days
    const b = await make();
    await markWorking(w.trading, b.orderId);
    await hold(b.symbol);
    await aged(b.orderId);
    // cancel requested and never confirmed
    const c = await make();
    await markWorking(w.trading, c.orderId);
    await hold(c.symbol);
    await requestCancel(w.trading, c.orderId, new Date(Date.now() - 3 * 86_400_000));
    await aged(c.orderId);
    // filled, release never ran
    const d = await make();
    await markWorking(w.trading, d.orderId);
    await bookFill(w.trading, { fillId: `${d.orderId}:0`, orderId: d.orderId, quantity: "10", price: "100", executedAt: new Date() });
    // cancelled, release never ran
    const e = await make();
    await markWorking(w.trading, e.orderId);
    await hold(e.symbol);
    await requestCancel(w.trading, e.orderId, new Date(Date.now() - 3 * 86_400_000));
    await confirmCancel(w.trading, e.orderId, new Date(Date.now() - 3 * 86_400_000));
    await aged(e.orderId);

    const t0 = Date.now();
    for (const offset of [0, 1_000, 2_000, 60_000, 120_000]) await tick(w.trading, venue(), new Date(t0 + offset));

    expect(await w.order(a.orderId)).toMatchObject({ status: "filled", needs_attention: null });
    for (const x of [b, c, e]) expect(await w.order(x.orderId)).toMatchObject({ status: "cancelled", cancelled_qty: "10.00000000", needs_attention: null });
    expect(await w.order(d.orderId)).toMatchObject({ status: "filled" });
    for (const x of [a, b, c, d, e]) {
      expect((await w.reservation(x.orderId)).released_at).not.toBeNull();
      expect(await w.count("fills", x.orderId)).toBe(x.orderId === a.orderId || x.orderId === d.orderId ? 1 : 0);
    }
    // what came back: a filled order keeps what it spent, a cancelled one gets everything back
    expect(await w.buyingPower(a.accountId)).toBe("9000.00000000");
    expect(await w.buyingPower(b.accountId)).toBe("10000.00000000");
    expect(await w.buyingPower(c.accountId)).toBe("10000.00000000");
    // a further tick changes nothing
    expect(await tick(w.trading, venue(), new Date(t0 + 180_000))).toMatchObject({ fills: 0, cancels: 0, placed: 0, cancelRequested: 0, released: 0, errors: 0 });
  });
});
