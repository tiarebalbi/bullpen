/**
 * A stock price is a close, hours old by the time anyone trades it. Every order test used to seed a price seconds old, so a market buy filled
 * here and was cancelled by the sweep in production (ADR-0024). These tests seed prices the way the stock ingest stores them (as of the close,
 * kind 'end-of-day') and run the venue production uses (the derived one), not only the simulator.
 */
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { BuyRefused, DerivedVenue, LATE_FILL_WINDOW_MS, SimulatedVenue, advanceAccount, dbPriceSource, dispatchOrder, markWorking, placePlayerOrder, pump, submitOrder, sweep, WORKING_DEADLINE_MS } from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());
afterEach(() => w.assertInvariants());

/** The venue production uses fills about one order in ten in parts, so a player's next poll finishes it. */
async function settle(accountId: string, orderId: string): Promise<void> {
  for (let poll = 0; poll < 20 && (await w.order(orderId)).status !== "filled"; poll += 1) await advanceAccount(w.trading, accountId, new Date());
}

const derived = (accountId?: string) => new DerivedVenue(w.trading, { seed: 1, prices: dbPriceSource(w.marketData), partialRate: 0, accountId });

describe("a market buy at an end-of-day price", () => {
  it("fills at the close when the close is from the latest completed trading day, 20 hours old", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100", { ageHours: 20 });
    const accountId = await w.account("10000");
    const { orderId } = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "10", clientOrderId: `eod-${symbol}` });
    await settle(accountId, orderId);
    expect(await w.order(orderId)).toMatchObject({ status: "filled", filled_qty: "10.00000000" });
    expect((await w.trading.query("SELECT price::text FROM trading.fills WHERE order_id = $1", [orderId])).rows[0].price).toBe("100.00000000");
    expect(await w.position(accountId, symbol)).toBe("10.00000000");
  });

  it("fills at a Friday close on a Monday: 68 hours old is still the latest completed trading day", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100", { ageHours: 68 });
    const accountId = await w.account("10000");
    const { orderId } = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "3", clientOrderId: `eod-${symbol}` });
    await settle(accountId, orderId);
    expect(await w.order(orderId)).toMatchObject({ status: "filled" });
  });

  it("the simulator fills at it too", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100");
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: `sim-${symbol}` });
    const venue = new SimulatedVenue({ seed: 1, prices: dbPriceSource(w.marketData), partialRate: 0 });
    await dispatchOrder(w.trading, venue, { orderId: order.orderId, symbol, quantity: "10", capPrice: order.capPrice }, new Date());
    await pump(w.trading, venue, new Date());
    expect(await w.order(order.orderId)).toMatchObject({ status: "filled" });
    expect(venue.heldPolls(order.orderId)).toBe(0);
  });

  it("is refused at submit when the close is older than the latest completed trading day, and nothing is written", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100", { ageHours: 100, staleClose: true });
    const accountId = await w.account("10000");
    await expect(submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: `old-${symbol}` })).rejects.toMatchObject({ reason: "stale-price" });
    await expect(submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: `old-${symbol}` })).rejects.toBeInstanceOf(BuyRefused);
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
    expect((await w.trading.query("SELECT 1 FROM trading.orders WHERE account_id = $1", [accountId])).rowCount).toBe(0);
  });

  it("holds an order whose close went stale after it was accepted: the venue never fills at an older close", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100");
    const accountId = await w.account("10000");
    const accepted = await submitOrder(w.trading, { accountId, symbol, quantity: "1", clientOrderId: `later-${symbol}` });
    await markWorking(w.trading, accepted.orderId);
    await w.marketData.query("UPDATE market_data.quotes SET valid_until = now() - interval '1 second' WHERE symbol = $1", [symbol]);
    expect(await pump(w.trading, derived(accountId), new Date())).toMatchObject({ fills: 0 });
    expect(await w.order(accepted.orderId)).toMatchObject({ status: "working" });
  });
});

describe("the 15-minute working deadline", () => {
  it("does not fire on a fillable stock order: it fills on the first pass and the sweep 16 minutes on finds nothing to cancel", async () => {
    const symbol = w.symbol();
    await w.endOfDayPrice(symbol, "100");
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "90", clientOrderId: `dl-${symbol}` });
    const venue = derived(accountId);
    await dispatchOrder(w.trading, venue, { orderId: order.orderId, symbol, quantity: "90", capPrice: order.capPrice }, new Date());
    await pump(w.trading, venue, new Date());
    expect(await w.order(order.orderId)).toMatchObject({ status: "filled" });

    await w.trading.query("UPDATE trading.orders SET updated_at = now() - interval '16 minutes' WHERE order_id = $1", [order.orderId]);
    const result = await sweep(w.trading, venue, new Date());
    expect(result.cancelRequested).toBe(0);
    expect(await w.order(order.orderId)).toMatchObject({ status: "filled", cancelled_qty: "0.00000000" });
    expect(WORKING_DEADLINE_MS).toBe(15 * 60_000);
  });

  it("still cancels an order that nothing can fill: a live price older than 5 minutes is held, and the deadline cancels it", async () => {
    const symbol = w.symbol();
    await w.price(symbol, "100", { ageMs: 6 * 60_000 });
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "5", clientOrderId: `live-${symbol}` });
    const venue = derived(accountId);
    await dispatchOrder(w.trading, venue, { orderId: order.orderId, symbol, quantity: "5", capPrice: order.capPrice }, new Date());
    expect(await pump(w.trading, venue, new Date())).toMatchObject({ fills: 0 });
    await w.trading.query("UPDATE trading.orders SET updated_at = now() - interval '16 minutes' WHERE order_id = $1", [order.orderId]);
    const now = new Date();
    expect((await sweep(w.trading, venue, now)).cancelRequested).toBeGreaterThanOrEqual(1);
    await advanceAccount(w.trading, accountId, new Date(now.getTime() + 10_000));
    expect(await w.order(order.orderId)).toMatchObject({ status: "cancelled" });
    await sweep(w.trading, venue, new Date(now.getTime() + LATE_FILL_WINDOW_MS + 10_000));
  });
});
