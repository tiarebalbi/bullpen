/**
 * What a player's polls and screens see, from the real lifecycle: each of the seven order states is produced by the lifecycle (not inserted),
 * read through readAccountView, and checked against the account view contract. Also the contract between the trading app and the lifecycle code.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { validateAccountView } from "@bullpen/contracts";
import { CANCEL_ACK_DELAY_MS, LATE_FILL_WINDOW_MS, STARTING_CASH, advanceAccount, bookFill, cancelPlayerOrder, ensurePlayerAccount, placePlayerOrder, readAccountView, submitOrder } from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());
afterEach(() => w.assertInvariants());

const later = (ms: number): Date => new Date(Date.now() + ms);

async function player(): Promise<string> {
  const account = await ensurePlayerAccount(w.trading, `user-${randomUUID()}`);
  w.accounts.push({ accountId: account.accountId, startingCash: STARTING_CASH });
  return account.accountId;
}
async function view(accountId: string, now = new Date()) {
  const v = (await readAccountView(w.trading, accountId, now))!;
  expect(validateAccountView(JSON.parse(JSON.stringify(v)))).toEqual({ valid: true, errors: null }); // the contract between the app and the lifecycle
  return v;
}
/** An accepted order for 10 at a price of 100 (ceiling 105); `then` makes it unfillable by posting a newer, higher quote. */
async function accepted(accountId: string, options: { hold?: boolean } = {}): Promise<{ orderId: string; symbol: string }> {
  const symbol = w.symbol();
  await w.price(symbol, "100", { ageMs: 5000 });
  const order = await submitOrder(w.trading, { accountId, symbol, quantity: "10", clientOrderId: randomUUID() });
  if (options.hold) await w.price(symbol, "110");
  return { orderId: order.orderId, symbol };
}
const orderOf = async (accountId: string, orderId: string) => (await view(accountId)).orders.find((o) => o.orderId === orderId)!;
/** About one fill in ten is partial (the simulator's rule), so an order may need a few polls to fill: poll until it has. */
async function settle(accountId: string, orderId: string): Promise<void> {
  for (let i = 0; i < 80 && (await orderOf(accountId, orderId)).state !== "filled"; i += 1) await advanceAccount(w.trading, accountId);
}

describe("a player's own order, from submit to the screen", () => {
  it("placing a market buy fills at the latest price and gives back the unused reservation in the same poll", async () => {
    const accountId = await player();
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const placed = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "10", clientOrderId: randomUUID() });
    await settle(accountId, placed.orderId);
    const v = await view(accountId);
    const order = v.orders.find((o) => o.orderId === placed.orderId)!;
    expect(order).toMatchObject({ state: "filled", filledQty: "10.00000000", avgPrice: "100.00000000", reserved: "1050.00000000", spent: "1000.00000000", released: "50.00000000", releaseDone: true });
    expect(v).toMatchObject({ buyingPower: "99000.00000000", reserved: "0.00000000", cash: "99000.00000000", positionsValue: "1000.00000000", equity: "100000.00000000" });
    expect(v.positions).toEqual([{ symbol, quantity: "10.00000000", avgCost: "100.00000000", price: "100.00000000", value: "1000.00000000" }]);
  });

  it("a retry with the same key is the same order: one order, one reservation", async () => {
    const accountId = await player();
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const key = randomUUID();
    const first = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "5", clientOrderId: key });
    const second = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "5", clientOrderId: key });
    expect(second).toEqual({ orderId: first.orderId, duplicate: true });
    expect((await view(accountId)).orders).toHaveLength(1);
  });

  it("shows the seven states, each produced by the lifecycle, each meeting the contract", async () => {
    const accountId = await player();

    // accepted: reserved, not yet handed to the venue
    const a = await accepted(accountId);
    expect(await orderOf(accountId, a.orderId)).toMatchObject({ state: "accepted", filledQty: "0.00000000", openQty: "10.00000000", avgPrice: null, releaseDone: false });

    // working: handed to the venue, no fillable price (it is above the ceiling)
    const b = await accepted(accountId, { hold: true });
    await advanceAccount(w.trading, accountId);
    expect(await orderOf(accountId, b.orderId)).toMatchObject({ state: "working", openQty: "10.00000000" });

    // partially_filled: four of ten booked
    const c = await accepted(accountId, { hold: true });
    await advanceAccount(w.trading, accountId);
    await bookFill(w.trading, { fillId: `${c.orderId}:0`, orderId: c.orderId, quantity: "4", price: "100", executedAt: new Date() });
    expect(await orderOf(accountId, c.orderId)).toMatchObject({ state: "partially_filled", filledQty: "4.00000000", openQty: "6.00000000", avgPrice: "100.00000000" });

    // cancel_requested: asked for, not yet confirmed: a request is not a cancel
    const d = await accepted(accountId, { hold: true });
    await advanceAccount(w.trading, accountId);
    expect(await cancelPlayerOrder(w.trading, accountId, d.orderId)).toBe("requested");
    const requested = await orderOf(accountId, d.orderId);
    expect(requested).toMatchObject({ state: "cancel_requested", cancelledQty: "0.00000000", openQty: "10.00000000", releaseDone: false });
    expect(requested.cancelRequestedAt).not.toBeNull();

    // cancelled: the venue confirmed; what was filled and what was released are both on the order
    await advanceAccount(w.trading, accountId, later(CANCEL_ACK_DELAY_MS + 1000));
    expect(await orderOf(accountId, d.orderId)).toMatchObject({ state: "cancelled", cancelledQty: "10.00000000", filledQty: "0.00000000", releaseDone: false, released: "0.00000000" });
    await advanceAccount(w.trading, accountId, later(CANCEL_ACK_DELAY_MS + LATE_FILL_WINDOW_MS + 5000));
    expect(await orderOf(accountId, d.orderId)).toMatchObject({ state: "cancelled", releaseDone: true, released: "1050.00000000" });

    // filled
    const symbol = w.symbol();
    await w.price(symbol, "100");
    const placed = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "1", clientOrderId: randomUUID() });
    await settle(accountId, placed.orderId);
    expect(await orderOf(accountId, placed.orderId)).toMatchObject({ state: "filled" });

    // rejected: the venue refuses an order whose quote was withdrawn after it was accepted; the reservation comes back at once
    const e = await accepted(accountId);
    await w.marketData.query("DELETE FROM market_data.quotes WHERE symbol = $1", [e.symbol]);
    await advanceAccount(w.trading, accountId);
    expect(await orderOf(accountId, e.orderId)).toMatchObject({ state: "rejected", filledQty: "0.00000000", releaseDone: true, released: "1050.00000000" });
  });

  it("an account's view lists only its own orders and positions, and nothing that names a person", async () => {
    const [mine, theirs] = [await player(), await player()];
    const symbol = w.symbol();
    await w.price(symbol, "100");
    await placePlayerOrder(w.trading, theirs, { symbol, quantity: "3", clientOrderId: randomUUID() });
    const v = await view(mine);
    expect(v.orders).toEqual([]);
    expect(v.positions).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(/user-|owner|login|email/i);
  });

  it("advancing one player's orders leaves another player's untouched", async () => {
    const [a, b] = [await player(), await player()];
    const first = await accepted(a);
    const second = await accepted(b);
    await advanceAccount(w.trading, a);
    expect((await orderOf(a, first.orderId)).state).toMatch(/^(filled|partially_filled)$/); // the venue took it and began to fill it
    await settle(a, first.orderId);
    expect((await orderOf(a, first.orderId)).state).toBe("filled");
    expect((await orderOf(b, second.orderId)).state).toBe("accepted");
  });

  it("polls at the same moment book no fill twice: each fill has two ledger entries, the fills add up to the order, and the release happens once", async () => {
    const accountId = await player();
    const order = await accepted(accountId);
    for (let round = 0; round < 3; round += 1) await Promise.all([advanceAccount(w.trading, accountId), advanceAccount(w.trading, accountId), advanceAccount(w.trading, accountId)]);
    await settle(accountId, order.orderId);
    const fills = await w.count("fills", order.orderId);
    expect(fills).toBeGreaterThanOrEqual(1);
    expect(await w.count("ledger", order.orderId)).toBe(fills * 2);
    const summed = (await w.trading.query<{ q: string }>("SELECT sum(quantity)::text AS q FROM trading.fills WHERE order_id = $1 AND booked", [order.orderId])).rows[0]!.q;
    expect(summed).toBe("10.00000000");
    expect(await orderOf(accountId, order.orderId)).toMatchObject({ state: "filled", releaseDone: true, released: "50.00000000" });
  });

  it("a cancel on someone else's order is 'not-found', and on a finished one 'too-late'", async () => {
    const [mine, theirs] = [await player(), await player()];
    const order = await accepted(theirs);
    expect(await cancelPlayerOrder(w.trading, mine, order.orderId)).toBe("not-found");
    await advanceAccount(w.trading, theirs);
    await settle(theirs, order.orderId);
    expect(await cancelPlayerOrder(w.trading, theirs, order.orderId)).toBe("too-late");
  });

  it("the view carries the average cost of the booked fills, the latest order's own history and the recent fills", async () => {
    const accountId = await player();
    const symbol = w.symbol();
    await w.price(symbol, "100", { ageMs: 5000 });
    const first = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "10", clientOrderId: randomUUID() });
    await settle(accountId, first.orderId);
    await w.price(symbol, "110", { ageMs: 1000 });
    const second = await placePlayerOrder(w.trading, accountId, { symbol, quantity: "10", clientOrderId: randomUUID() });
    await settle(accountId, second.orderId);

    const v = await view(accountId);
    expect(v.positions.find((p) => p.symbol === symbol)).toMatchObject({ quantity: "20.00000000", avgCost: "105.00000000", price: "110.00000000" });
    expect(v.latestOrder?.orderId).toBe(second.orderId);
    const kinds = v.latestOrder!.events.map((e) => e.kind);
    expect(kinds.slice(0, 2)).toEqual(["accepted", "working"]);
    expect(kinds).toContain("fill");
    expect(kinds.at(-1)).toBe("released");
    expect(v.latestOrder!.events.filter((e) => e.kind === "fill").every((e) => e.quantity !== null && e.price === "110.00000000")).toBe(true);
    expect(v.fills.length).toBeGreaterThanOrEqual(2);
    expect(v.fills[0]).toMatchObject({ symbol, side: "buy", price: "110.00000000" }); // newest first
    expect(JSON.stringify(v)).not.toMatch(/account_id|accountId|user/i);
  });

  it("an account with no orders has no latest order and no fills", async () => {
    const v = await view(await player());
    expect(v).toMatchObject({ latestOrder: null, fills: [], positions: [] });
  });
});
