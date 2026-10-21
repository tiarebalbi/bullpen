/**
 * Experiments 2, 3 and 4 of Part 4: a duplicate fill whose first delivery committed but was never acknowledged; a crash
 * after a side effect and before success is recorded; a compensation (the release) that keeps failing.
 */
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import {
  CrashError, LATE_FILL_WINDOW_MS, MAX_RELEASE_FAILURES, SimulatedVenue, bookFill, confirmCancel, dbPriceSource, dispatchOrder, markWorking, pump, releaseReservation, requestCancel, submitOrder, sweep,
  type Boundary, type Hooks, type Venue,
} from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());
afterEach(() => w.assertInvariants());

const T0 = new Date("2026-10-20T12:00:00.000Z");
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const SETTLED = at(1000 + LATE_FILL_WINDOW_MS + 1);
const crashAt = (boundary: Boundary): Hooks => {
  let fired = false;
  return { at: (b) => { if (b === boundary && !fired) { fired = true; throw new CrashError(b); } } };
};
/** Runs a step; if it "dies" at the boundary, runs it again, as a retry after a restart would. */
async function withCrash<T>(boundary: Boundary, step: (hooks: Hooks) => Promise<T>): Promise<{ crashed: boolean; result: T }> {
  const hooks = crashAt(boundary);
  try {
    return { crashed: false, result: await step(hooks) };
  } catch (error) {
    if (!(error instanceof CrashError)) throw error;
    return { crashed: true, result: await step({}) };
  }
}

async function rig(qty = "10") {
  const symbol = w.symbol();
  await w.price(symbol, "100");
  const accountId = await w.account("10000");
  return { symbol, accountId, submit: (hooks: Hooks = {}) => submitOrder(w.trading, { accountId, symbol, quantity: qty, clientOrderId: `k-${symbol}` }, hooks) };
}
const snapshot = async (accountId: string, orderId: string, symbol: string) => ({
  buyingPower: await w.buyingPower(accountId),
  reservation: { ...(await w.reservation(orderId)), released_at: null },
  ledger: await w.count("ledger", orderId),
  fills: await w.count("fills", orderId),
  position: await w.position(accountId, symbol),
  order: { ...(await w.order(orderId)), version: 0 },
});
const fill = (orderId: string, id: string, quantity: string, executedMs: number) => ({ fillId: `${orderId}:${id}`, orderId, quantity, price: "100", executedAt: at(executedMs) });

describe("experiment 2: a duplicate fill after a lost acknowledgement", () => {
  it("the first delivery committed and its acknowledgement was lost: the second changes nothing", async () => {
    const { accountId, symbol, submit } = await rig();
    const order = await submit();
    await markWorking(w.trading, order.orderId);
    const f = fill(order.orderId, "1", "4", 100);

    const first = await withCrash("fill:after-commit", (hooks) => bookFill(w.trading, f, hooks));
    expect(first.crashed).toBe(true); // the caller never heard the first delivery succeed
    expect(first.result.outcome).toBe("duplicate"); // the retry found it already booked
    const afterRetry = await snapshot(accountId, order.orderId, symbol);

    // a control order that saw the fill exactly once ends in the same place
    const control = await rig();
    const controlOrder = await control.submit();
    await markWorking(w.trading, controlOrder.orderId);
    await bookFill(w.trading, fill(controlOrder.orderId, "1", "4", 100));
    const once = await snapshot(control.accountId, controlOrder.orderId, control.symbol);

    expect(afterRetry).toEqual(once);
    expect(afterRetry).toMatchObject({ ledger: 2, fills: 1, position: "4.00000000" });
    expect(afterRetry.reservation).toMatchObject({ reserved: "1050.00000000", spent: "400.00000000", released: "0.00000000" });
  });

  it("a venue that delivers every fill twice leaves the account as if it had delivered once", async () => {
    const { accountId, symbol, submit } = await rig();
    const order = await submit();
    const venue = new SimulatedVenue({ seed: 7, prices: dbPriceSource(w.marketData), partialRate: 0, duplicateRate: 1 });
    await dispatchOrder(w.trading, venue, { orderId: order.orderId, symbol, quantity: "10", capPrice: order.capPrice }, new Date());
    const first = await pump(w.trading, venue, new Date());
    expect(first.fills).toBe(1);
    const afterFirst = await snapshot(accountId, order.orderId, symbol);
    for (const fillAgain of venue.emittedFills(order.orderId)) expect(await bookFill(w.trading, fillAgain)).toMatchObject({ outcome: "duplicate" });
    expect(await snapshot(accountId, order.orderId, symbol)).toEqual(afterFirst);
  });
});

describe("experiment 3: a crash after a side effect and before success is recorded", () => {
  it.each(["submit:after-reserve", "submit:after-order"] as const)("submit dying at %s rolls back, and the retry reserves once", async (boundary) => {
    const { accountId, submit } = await rig();
    const out = await withCrash(boundary, (hooks) => submit(hooks));
    expect(out.crashed).toBe(true);
    expect(out.result.duplicate).toBe(false);
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    expect((await w.trading.query("SELECT count(*)::int AS n FROM trading.reservations WHERE account_id = $1", [accountId])).rows[0].n).toBe(1);
  });

  it("submit dying after the commit: the retry returns the same order and reserves nothing more", async () => {
    const { accountId, submit } = await rig();
    const out = await withCrash("submit:after-commit", (hooks) => submit(hooks));
    expect(out.crashed).toBe(true);
    expect(out.result.duplicate).toBe(true);
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    expect((await w.trading.query("SELECT count(*)::int AS n FROM trading.orders WHERE account_id = $1", [accountId])).rows[0].n).toBe(1);
  });

  it.each(["fill:after-fill-row", "fill:after-ledger", "fill:before-commit", "fill:after-commit"] as const)("a fill dying at %s: the retry leaves one fill, one pair of ledger entries and one position", async (boundary) => {
    const { accountId, symbol, submit } = await rig();
    const order = await submit();
    await markWorking(w.trading, order.orderId);
    const out = await withCrash(boundary, (hooks) => bookFill(w.trading, fill(order.orderId, "1", "4", 100), hooks));
    expect(out.crashed).toBe(true);
    expect(await snapshot(accountId, order.orderId, symbol)).toMatchObject({ ledger: 2, fills: 1, position: "4.00000000", buyingPower: "8950.00000000" });
    expect(await w.reservation(order.orderId)).toMatchObject({ spent: "400.00000000" });
  });

  it.each(["release:before-update", "release:after-commit"] as const)("a release dying at %s: the retry returns the unused reservation once", async (boundary) => {
    const { accountId, submit } = await rig();
    const order = await submit();
    await markWorking(w.trading, order.orderId);
    await bookFill(w.trading, fill(order.orderId, "1", "10", 100));
    const out = await withCrash(boundary, (hooks) => releaseReservation(w.trading, order.orderId, at(500), hooks));
    expect(out.crashed).toBe(true);
    expect(await w.buyingPower(accountId)).toBe("9000.00000000");
    expect(await releaseReservation(w.trading, order.orderId, at(600))).toEqual({ outcome: "already" });
  });

  it.each(["cancel:before-commit", "cancel:after-commit"] as const)("a cancel request dying at %s: the retry leaves one cancel_requested order", async (boundary) => {
    const { submit } = await rig();
    const order = await submit();
    await markWorking(w.trading, order.orderId);
    const out = await withCrash(boundary, (hooks) => requestCancel(w.trading, order.orderId, at(500), hooks));
    expect(out.crashed).toBe(true);
    expect(await w.order(order.orderId)).toMatchObject({ status: "cancel_requested" });
    expect(await w.count("order_events", order.orderId)).toBe(3); // accepted, working, cancel_requested
  });

  it("a crash between handing the order to the venue and marking it working: the next sweep completes it, the venue holds one order", async () => {
    const { accountId, symbol, submit } = await rig();
    const order = await submit();
    const placed: string[] = [];
    const venue: Venue = {
      place: async (o) => { if (!placed.includes(o.orderId)) placed.push(o.orderId); },
      cancel: async () => undefined,
      poll: async () => [],
    };
    await venue.place({ orderId: order.orderId, symbol, quantity: "10", capPrice: order.capPrice }, new Date()); // placed, then the process died before markWorking
    expect(await w.order(order.orderId)).toMatchObject({ status: "accepted" });
    await w.trading.query("UPDATE trading.orders SET updated_at = now() - interval '2 minutes' WHERE order_id = $1", [order.orderId]);

    // The sweep reads the whole database, so another test file's accepted orders may be swept too: count this order's own placements.
    const first = await sweep(w.trading, venue, new Date());
    expect(first.placed).toBeGreaterThanOrEqual(1);
    expect(first.errors).toEqual([]);
    await sweep(w.trading, venue, new Date());
    expect(placed.filter((id) => id === order.orderId)).toEqual([order.orderId]);
    expect(await w.order(order.orderId)).toMatchObject({ status: "working" });
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
  });
});

describe("experiment 4: a compensation that keeps failing", () => {
  it("the order is flagged after the limit, the release keeps retrying, and recovery leaves the account correct", async () => {
    const { accountId, symbol, submit } = await rig();
    const order = await submit();
    await markWorking(w.trading, order.orderId);
    await bookFill(w.trading, fill(order.orderId, "1", "4", 100));
    await requestCancel(w.trading, order.orderId, at(500));
    await confirmCancel(w.trading, order.orderId, at(1000));

    let failing = true;
    const hooks: Hooks = { at: (b) => { if (failing && b === "release:before-update") throw new Error("connection reset while releasing"); } };
    const venue: Venue = { place: async () => undefined, cancel: async () => undefined, poll: async () => [] };
    const results = [];
    for (let i = 0; i < MAX_RELEASE_FAILURES + 2; i += 1) results.push(await sweep(w.trading, venue, SETTLED, hooks));

    // what the order looks like while the compensation fails: cancelled, money still held, flagged, error recorded
    expect(await w.order(order.orderId)).toMatchObject({ status: "cancelled", filled_qty: "4.00000000", cancelled_qty: "6.00000000", needs_attention: "release-failing" });
    const stuck = await w.reservation(order.orderId);
    expect(stuck).toMatchObject({ released_at: null, release_failures: MAX_RELEASE_FAILURES + 2 });
    expect((await w.trading.query("SELECT last_release_error FROM trading.reservations WHERE order_id = $1", [order.orderId])).rows[0].last_release_error).toBe("connection reset while releasing");
    expect(await w.buyingPower(accountId)).toBe("8950.00000000"); // the reservation is still held, not lost
    // it retried on every sweep, and was flagged exactly once, on the failure that reached the limit
    expect(results.map((r) => r.releaseFailed)).toEqual([1, 1, 1, 1, 1]);
    expect(results.map((r) => r.flagged)).toEqual([0, 0, 1, 0, 0]);
    // the account's cash still adds up while it is stuck: reserved money is counted as reserved
    await w.assertInvariants();

    failing = false;
    expect(await sweep(w.trading, venue, SETTLED, hooks)).toMatchObject({ released: 1, releaseFailed: 0 });
    expect(await w.order(order.orderId)).toMatchObject({ status: "cancelled", needs_attention: null });
    expect(await w.reservation(order.orderId)).toMatchObject({ released: "650.00000000" });
    expect(await w.buyingPower(accountId)).toBe("9600.00000000");
    expect(await w.position(accountId, symbol)).toBe("4.00000000");
    expect(await sweep(w.trading, venue, SETTLED, hooks)).toMatchObject({ released: 0, releaseFailed: 0 }); // nothing left to do
  });
});
