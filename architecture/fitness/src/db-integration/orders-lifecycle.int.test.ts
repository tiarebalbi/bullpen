import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { BuyRefused, LATE_FILL_WINDOW_MS, SimulatedVenue, bookFill, confirmCancel, dbPriceSource, dispatchOrder, markWorking, pump, releaseReservation, requestCancel, submitOrder, sweep, WORKING_DEADLINE_MS } from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());
afterEach(() => w.assertInvariants());

const T0 = new Date("2026-10-20T12:00:00.000Z");
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const SETTLED = at(1000 + LATE_FILL_WINDOW_MS + 1);

/** An account with 10,000, a price of 100, and a 10-share order: it reserves 10 x 105 (the 5 % ceiling) = 1,050. */
async function accepted(qty = "10") {
  const symbol = w.symbol();
  await w.price(symbol, "100");
  const accountId = await w.account("10000");
  const order = await submitOrder(w.trading, { accountId, symbol, quantity: qty, clientOrderId: `c-${symbol}` });
  await markWorking(w.trading, order.orderId);
  return { accountId, symbol, orderId: order.orderId };
}
const fill = (orderId: string, id: string, quantity: string, executedMs: number, price = "100") => ({ fillId: `${orderId}:${id}`, orderId, quantity, price, executedAt: at(executedMs) });

describe("submitting an order reserves buying power and nothing else", () => {
  it("reserves at the price ceiling and holds the order as accepted", async () => {
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: "a" });
    expect(order).toMatchObject({ state: "accepted", reserved: "1050.00000000", capPrice: "105.00000000", duplicate: false });
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    expect(await w.count("ledger", order.orderId)).toBe(0);
  });

  it("returns the same order for the same client key and reserves once", async () => {
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const accountId = await w.account("10000");
    const first = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: "same" });
    const second = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: "same" });
    expect(second).toMatchObject({ orderId: first.orderId, duplicate: true });
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
  });

  it("refuses with nothing written when buying power is short, the price is missing or the price is stale", async () => {
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const poor = await w.account("500");
    await expect(submitOrder(w.trading, { accountId: poor, symbol, quantity: "10", clientOrderId: "x" })).rejects.toMatchObject({ reason: "insufficient-buying-power" });
    await expect(submitOrder(w.trading, { accountId: poor, symbol: w.symbol(), quantity: "1", clientOrderId: "y" })).rejects.toBeInstanceOf(BuyRefused);
    const stale = w.symbol();
    await w.price(stale, "100", { stale: true });
    await expect(submitOrder(w.trading, { accountId: poor, symbol: stale, quantity: "1", clientOrderId: "z" })).rejects.toMatchObject({ reason: "stale-price" });
    expect(await w.buyingPower(poor)).toBe("500.00000000");
  });
});

describe("booking fills", () => {
  it("fills the order, then release returns only what the ceiling over-reserved", async () => {
    const { accountId, symbol, orderId } = await accepted();
    expect(await bookFill(w.trading, fill(orderId, "1", "10", 100))).toMatchObject({ outcome: "booked", state: "filled" });
    expect(await w.position(accountId, symbol)).toBe("10.00000000");
    expect(await releaseReservation(w.trading, orderId, at(200))).toEqual({ outcome: "released", amount: "50.00000000" });
    expect(await w.buyingPower(accountId)).toBe("9000.00000000");
  });

  it("books partial fills in order and leaves the order partially filled until the rest arrives", async () => {
    const { orderId } = await accepted();
    expect(await bookFill(w.trading, fill(orderId, "1", "4", 100))).toMatchObject({ state: "partially_filled" });
    expect(await bookFill(w.trading, fill(orderId, "2", "3", 200))).toMatchObject({ state: "partially_filled" });
    expect(await bookFill(w.trading, fill(orderId, "3", "3", 300))).toMatchObject({ state: "filled" });
    expect(await w.order(orderId)).toMatchObject({ filled_qty: "10.00000000", open_qty: "0.00000000" });
  });

  it("a duplicate delivery changes nothing: ledger, position and reservation stay as the first left them", async () => {
    const { accountId, symbol, orderId } = await accepted();
    const f = fill(orderId, "1", "4", 100);
    await bookFill(w.trading, f);
    const before = { ledger: await w.count("ledger", orderId), res: await w.reservation(orderId), pos: await w.position(accountId, symbol), order: await w.order(orderId), bp: await w.buyingPower(accountId) };
    expect(await bookFill(w.trading, f)).toMatchObject({ outcome: "duplicate" });
    expect(await bookFill(w.trading, f)).toMatchObject({ outcome: "duplicate" });
    expect({ ledger: await w.count("ledger", orderId), res: await w.reservation(orderId), pos: await w.position(accountId, symbol), order: await w.order(orderId), bp: await w.buyingPower(accountId) }).toEqual(before);
  });

  it("two different fills for one order, booked at the same moment, are both booked (the second retries on the order's new version)", async () => {
    const { orderId } = await accepted();
    const results = await Promise.all([bookFill(w.trading, fill(orderId, "1", "4", 100)), bookFill(w.trading, fill(orderId, "2", "6", 100))]);
    expect(results.map((r) => r.outcome)).toEqual(["booked", "booked"]);
    expect(await w.order(orderId)).toMatchObject({ status: "filled", filled_qty: "10.00000000", open_qty: "0.00000000" });
  });

  it("stores a fill for more than is open as an anomaly, books nothing and flags the order", async () => {
    const { accountId, symbol, orderId } = await accepted();
    expect(await bookFill(w.trading, fill(orderId, "1", "11", 100))).toMatchObject({ outcome: "anomaly", reason: "exceeds-quantity" });
    expect(await w.order(orderId)).toMatchObject({ filled_qty: "0.00000000", needs_attention: "exceeds-quantity" });
    expect(await w.position(accountId, symbol)).toBe("0");
    expect(await w.count("ledger", orderId)).toBe(0);
  });
});

describe("a cancel request is not a cancel", () => {
  it("partial fill then cancel: the filled quantity is booked, the rest cancelled, only the unused reservation released", async () => {
    const { accountId, symbol, orderId } = await accepted();
    await bookFill(w.trading, fill(orderId, "1", "4", 100));
    expect(await requestCancel(w.trading, orderId, at(500))).toBe("requested");
    expect(await w.order(orderId)).toMatchObject({ status: "cancel_requested", open_qty: "6.00000000" });
    expect(await confirmCancel(w.trading, orderId, at(1000))).toBe("cancelled");
    expect(await w.order(orderId)).toMatchObject({ status: "cancelled", filled_qty: "4.00000000", cancelled_qty: "6.00000000", open_qty: "0.00000000" });
    expect(await releaseReservation(w.trading, orderId, at(1001))).toEqual({ outcome: "not-yet" });
    expect(await releaseReservation(w.trading, orderId, SETTLED)).toEqual({ outcome: "released", amount: "650.00000000" });
    expect(await w.position(accountId, symbol)).toBe("4.00000000");
    expect(await w.buyingPower(accountId)).toBe("9600.00000000");
  });

  it("books a fill that executed before the cancel took effect, even when it arrives after the order shows cancelled", async () => {
    const { orderId } = await accepted();
    await requestCancel(w.trading, orderId, at(500));
    await confirmCancel(w.trading, orderId, at(1000));
    expect(await bookFill(w.trading, fill(orderId, "1", "4", 700))).toMatchObject({ outcome: "booked", state: "cancelled" });
    expect(await w.order(orderId)).toMatchObject({ filled_qty: "4.00000000", cancelled_qty: "6.00000000" });
  });

  it("a late fill that completes the order ends it filled, not cancelled", async () => {
    const { orderId } = await accepted();
    await requestCancel(w.trading, orderId, at(500));
    await confirmCancel(w.trading, orderId, at(1000));
    await bookFill(w.trading, fill(orderId, "1", "4", 700));
    expect(await bookFill(w.trading, fill(orderId, "2", "6", 800))).toMatchObject({ outcome: "booked", state: "filled" });
  });

  it("cancel_requested -> filled: the remaining quantity fills before the cancel takes effect", async () => {
    const { orderId } = await accepted();
    await requestCancel(w.trading, orderId, at(500));
    expect(await bookFill(w.trading, fill(orderId, "1", "10", 600))).toMatchObject({ outcome: "booked", state: "filled" });
    expect(await confirmCancel(w.trading, orderId, at(1000))).toBe("ignored");
    expect(await w.order(orderId)).toMatchObject({ status: "filled", cancelled_qty: "0.00000000" });
  });

  it("a cancel after the order filled is too late and changes nothing", async () => {
    const { orderId } = await accepted();
    await bookFill(w.trading, fill(orderId, "1", "10", 100));
    expect(await requestCancel(w.trading, orderId, at(500))).toBe("too-late");
  });

  it("a fill that executed at or after the effective time is not booked and flags the order", async () => {
    const { accountId, symbol, orderId } = await accepted();
    await requestCancel(w.trading, orderId, at(500));
    await confirmCancel(w.trading, orderId, at(1000));
    expect(await bookFill(w.trading, fill(orderId, "1", "4", 1000))).toMatchObject({ outcome: "anomaly", reason: "executed-after-cancel-effective" });
    expect(await w.position(accountId, symbol)).toBe("0");
    expect(await w.order(orderId)).toMatchObject({ needs_attention: "executed-after-cancel-effective", filled_qty: "0.00000000" });
  });

  it("a late fill after the reservation was released takes the money back from buying power; if there is none it is stored unbooked", async () => {
    const { accountId, orderId } = await accepted();
    await requestCancel(w.trading, orderId, at(500));
    await confirmCancel(w.trading, orderId, at(1000));
    await releaseReservation(w.trading, orderId, SETTLED);
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
    expect(await bookFill(w.trading, fill(orderId, "1", "4", 900))).toMatchObject({ outcome: "booked", state: "cancelled" });
    expect(await w.buyingPower(accountId)).toBe("9600.00000000");

    await w.trading.query("UPDATE trading.accounts SET buying_power = 0 WHERE account_id = $1", [accountId]);
    w.accounts.splice(w.accounts.findIndex((a) => a.accountId === accountId), 1); // the test emptied the account by hand: its cash no longer adds up by design
    expect(await bookFill(w.trading, fill(orderId, "2", "3", 950))).toMatchObject({ outcome: "anomaly", reason: "unfundable" });
    expect(await w.buyingPower(accountId)).toBe("0.00000000");
  });
});

describe("the fill price rule", () => {
  const rig = async (price: string, options: { ageMs?: number; stale?: boolean } = {}) => {
    const symbol = w.symbol();
    await w.price(symbol, "100", { ageMs: 20 * 60_000 }); // old enough that the quote the test adds next is always the latest
    const accountId = await w.account("10000");
    const order = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: `c-${symbol}` });
    await w.price(symbol, price, options);
    const venue = new SimulatedVenue({ seed: 1, prices: dbPriceSource(w.marketData), partialRate: 0 });
    await dispatchOrder(w.trading, venue, { orderId: order.orderId, symbol, quantity: "10", capPrice: order.capPrice }, new Date());
    return { venue, orderId: order.orderId, accountId, symbol };
  };

  it("fills at the latest price of the contract", async () => {
    const { venue, orderId } = await rig("101.5");
    await pump(w.trading, venue, new Date());
    expect(await w.order(orderId)).toMatchObject({ status: "filled" });
    expect((await w.trading.query("SELECT price::text FROM trading.fills WHERE order_id = $1", [orderId])).rows[0].price).toBe("101.50000000");
  });

  it("holds the order when the latest price is older than the limit, and when it is flagged stale: nothing fills", async () => {
    for (const options of [{ ageMs: 6 * 60_000 }, { stale: true }]) {
      const { venue, orderId } = await rig("100", options);
      expect(await pump(w.trading, venue, new Date())).toMatchObject({ fills: 0 });
      expect(venue.heldPolls(orderId)).toBe(1);
      expect(await w.order(orderId)).toMatchObject({ status: "working", filled_qty: "0.00000000" });
    }
  });

  it("holds the order when the price is above its ceiling", async () => {
    const { venue, orderId } = await rig("106");
    await pump(w.trading, venue, new Date());
    expect(venue.heldPolls(orderId)).toBe(1);
    expect(await w.order(orderId)).toMatchObject({ status: "working" });
  });

  it("an order held past the working deadline is cancelled by the sweep, confirmed by the venue, and its reservation comes back", async () => {
    const { venue, orderId, accountId } = await rig("106");
    await pump(w.trading, venue, new Date());
    await w.trading.query("UPDATE trading.orders SET updated_at = now() - interval '16 minutes' WHERE order_id = $1", [orderId]);
    const now = new Date();
    expect(await sweep(w.trading, venue, now)).toMatchObject({ cancelRequested: 1 });
    await pump(w.trading, venue, now);
    expect(await w.order(orderId)).toMatchObject({ status: "cancelled", cancelled_qty: "10.00000000" });
    expect(await sweep(w.trading, venue, new Date(now.getTime() + LATE_FILL_WINDOW_MS + 1))).toMatchObject({ released: 1 });
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
    expect(WORKING_DEADLINE_MS).toBe(15 * 60_000);
  });
});
