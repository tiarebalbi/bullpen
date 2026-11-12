/**
 * Orders queued for the open (ADR-0028). A stock order placed while the market is closed is accepted and persisted with its reservation, unseen by the venue;
 * the sweep admits the queue in batches once the market opens. Every test runs against real Postgres with a fixed calendar clock, and after every test
 * Part 4's invariants (ADR-0017, ADR-0019) are checked on every account the test made, so no path here is allowed to break them.
 */
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { CrashError, DerivedVenue, admitQueuedOrder, advanceAccount, cancelPlayerOrder, dbPriceSource, placePlayerOrder, requestCancel, tick, type Hooks, type SweepOptions } from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"));
afterAll(() => w.close());
afterEach(async () => {
  // A test that leaves orders queued would hand them to the next test's batch: cancel what is still waiting, through the lifecycle, then check the invariants.
  const left = await w.trading.query<{ order_id: string }>("SELECT order_id FROM trading.orders WHERE status = 'queued_for_open'");
  for (const row of left.rows) await requestCancel(w.trading, row.order_id, new Date());
  await w.assertInvariants();
});

// Saturday 2026-11-14 10:00 ET: closed. Monday the 16th, 9:30:00 ET: the open (EST, UTC-5).
const SATURDAY = new Date("2026-11-14T15:00:00Z");
const MONDAY_OPEN = new Date("2026-11-16T14:30:00Z");
const at = (base: Date, seconds: number): Date => new Date(base.getTime() + seconds * 1000);

/**
 * One sweep pass on the real clock, with the market treated as open (or closed). The database stamps rows with its own now(), so a pass at a fixed calendar
 * instant days away would see every freshly dispatched order as idle and cancel it: that is the test's clock, not the lifecycle's. The calendar itself is
 * tested at fixed instants through admitQueuedOrder below, and in packages/contracts.
 */
const pass = (options: SweepOptions = {}, hooks: Hooks = {}, open = true) => tick(w.trading, venue(), new Date(), hooks, { isOpen: () => open, ...options });
const venue = () => new DerivedVenue(w.trading, { seed: 1, prices: dbPriceSource(w.marketData), partialRate: 0 });
const place = (accountId: string, symbol: string, quantity: string, key: string, now: Date) => placePlayerOrder(w.trading, accountId, { symbol, quantity, clientOrderId: key }, now);

/** A stock whose last close is 100 and a player with `cash`. */
async function stock(cash: string, close = "100"): Promise<{ symbol: string; accountId: string }> {
  const symbol = w.symbol();
  await w.endOfDayPrice(symbol, close, { ageHours: 20 });
  return { symbol, accountId: await w.account(cash) };
}
const state = async (orderId: string): Promise<string> => String((await w.order(orderId)).status);

describe("accepted before the open", () => {
  it("a stock order placed on a Saturday is persisted as queued_for_open, reserves buying power under the Part 4 rule and is not sent to the venue", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "q1", SATURDAY);
    expect(await state(orderId)).toBe("queued_for_open");
    // 10 shares at the ceiling: 100 x 1.05 x 10 = 1,050 held, the rest still available.
    expect(await w.reservation(orderId)).toMatchObject({ reserved: "1050.00000000", spent: "0.00000000", released_at: null });
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    // A player's own poll does not hand it to the venue: it is not working, it has no fill, and a later poll changes nothing.
    await advanceAccount(w.trading, accountId, MONDAY_OPEN);
    expect(await state(orderId)).toBe("queued_for_open");
    expect(await w.count("fills", orderId)).toBe(0);
    const history = await w.trading.query("SELECT kind FROM trading.order_events WHERE order_id = $1 ORDER BY event_id", [orderId]);
    expect(history.rows.map((r) => r.kind)).toEqual(["queued_for_open"]);
  });

  it("a retry with the same key returns the same queued order and reserves once", async () => {
    const { symbol, accountId } = await stock("10000");
    const first = await place(accountId, symbol, "10", "dup", SATURDAY);
    const again = await place(accountId, symbol, "10", "dup", SATURDAY);
    expect(again).toEqual({ orderId: first.orderId, duplicate: true });
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
  });

  it("is refused when there is not enough buying power, as before: nothing queued, nothing reserved", async () => {
    const { symbol, accountId } = await stock("100");
    await expect(place(accountId, symbol, "10", "poor", SATURDAY)).rejects.toMatchObject({ reason: "insufficient-buying-power" });
    expect(await w.buyingPower(accountId)).toBe("100.00000000");
  });

  it("is not queued when the market is open, or for a crypto (live) price at any hour", async () => {
    const { symbol, accountId } = await stock("10000");
    const during = await place(accountId, symbol, "1", "open-hours", MONDAY_OPEN);
    expect(await state(during.orderId)).not.toBe("queued_for_open");

    const crypto = w.symbol();
    await w.price(crypto, "50", { ageMs: 1000, kind: "live" });
    const weekend = await place(accountId, crypto, "1", "crypto", SATURDAY);
    expect(await state(weekend.orderId)).not.toBe("queued_for_open");
  });
});

describe("released in batches", () => {
  it("admits at most one batch a pass, oldest first, and does not run the whole backlog at 9:30:00", async () => {
    const { symbol, accountId } = await stock("1000000");
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) ids.push((await place(accountId, symbol, "1", `b${i}`, SATURDAY)).orderId);

    const first = await pass({ batchSize: 5 });
    expect(first.admitted).toBe(5);
    const states = await Promise.all(ids.map(state));
    expect(states.slice(0, 5).every((s) => s !== "queued_for_open")).toBe(true); // the oldest five
    expect(states.slice(5).every((s) => s === "queued_for_open")).toBe(true);

    const second = await pass({ batchSize: 5 });
    expect(second.admitted).toBe(5);
    const third = await pass({ batchSize: 5 });
    expect(third.admitted).toBe(2);
    expect((await Promise.all(ids.map(state))).includes("queued_for_open")).toBe(false);
  });

  it("books the admitted orders' fills once the venue has them, and ends with every reservation spent or released", async () => {
    const { symbol, accountId } = await stock("100000");
    const ids = [(await place(accountId, symbol, "3", "f1", SATURDAY)).orderId, (await place(accountId, symbol, "4", "f2", SATURDAY)).orderId];
    for (let i = 0; i < 6; i += 1) await pass();
    for (const id of ids) expect(await state(id)).toBe("filled");
    expect(await w.position(accountId, symbol)).toBe("7.00000000");
  });

  it("holds nothing at the fast cadence while the market is closed, and counts the queue; at the open the backlog is open work", async () => {
    const { symbol, accountId } = await stock("100000");
    // Settle whatever earlier tests left, so the count below is only about this test's orders.
    let baseline = await pass({}, {}, false);
    for (let i = 0; i < 10; i += 1) {
      const again = await pass({}, {}, false);
      if (again.open === baseline.open && again.errors === 0) break;
      baseline = again;
    }
    await place(accountId, symbol, "1", "c1", SATURDAY);
    await place(accountId, symbol, "1", "c2", SATURDAY);
    const closed = await pass({}, {}, false);
    expect(closed.queued).toBeGreaterThanOrEqual(2);
    expect(closed.admitted).toBe(0);
    expect(closed.open).toBe(baseline.open); // two queued orders add nothing to the fast cadence
    const whenOpen = await pass({ batchSize: 1 }, {}, true);
    expect(whenOpen.admitted).toBe(1);
    expect(whenOpen.open).toBe(baseline.open + 2); // one admitted and working, one still queued: the sweeper stays at 5 s until the queue is drained
  });
});

describe("duplicate release and retry are idempotent", () => {
  it("admitting twice admits once; the second call finds it already admitted", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "i1", SATURDAY);
    const [a, b] = await Promise.all([admitQueuedOrder(w.trading, orderId, MONDAY_OPEN), admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)]);
    expect([a.outcome, b.outcome].sort()).toEqual(["admitted", "already"]);
    expect(await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).toEqual({ outcome: "already" });
    expect(await state(orderId)).toBe("accepted");
    expect(Number((await w.trading.query("SELECT count(*) AS n FROM trading.order_events WHERE order_id = $1 AND kind = 'accepted'", [orderId])).rows[0].n)).toBe(1);
  });

  it("a crash before the commit leaves it queued and reserved; the retry admits it once", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "i2", SATURDAY);
    const crash: Hooks = { at: (b) => { if (b === "admit:before-commit") throw new CrashError(b); } };
    await expect(admitQueuedOrder(w.trading, orderId, MONDAY_OPEN, crash)).rejects.toBeInstanceOf(CrashError);
    expect(await state(orderId)).toBe("queued_for_open");
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    expect((await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).outcome).toBe("admitted");
    expect((await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).outcome).toBe("already");
  });

  it("a crash after the commit (the caller never heard) is found by the sweep, which dispatches the accepted order and fills it", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "i3", SATURDAY);
    const crash: Hooks = { at: (b) => { if (b === "admit:after-commit") throw new CrashError(b); } };
    await expect(admitQueuedOrder(w.trading, orderId, MONDAY_OPEN, crash)).rejects.toBeInstanceOf(CrashError);
    expect(await state(orderId)).toBe("accepted");
    // The sweep hands an accepted order to the venue after ACCEPT_TIMEOUT_MS (30 s) without a move.
    await w.trading.query("UPDATE trading.orders SET updated_at = updated_at - interval '1 minute' WHERE order_id = $1", [orderId]);
    for (let i = 0; i < 5; i += 1) await pass();
    expect(await state(orderId)).toBe("filled");
  });

  it("is never admitted while the market is closed, even if asked to", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "i4", SATURDAY);
    expect(await admitQueuedOrder(w.trading, orderId, at(MONDAY_OPEN, -1))).toEqual({ outcome: "not-open" });
    expect(await admitQueuedOrder(w.trading, orderId, at(SATURDAY, 3600))).toEqual({ outcome: "not-open" });
    expect(await state(orderId)).toBe("queued_for_open");
  });
});

describe("the database is slow during the release", () => {
  it("a pass that runs out of its time budget admits a short batch and leaves the rest queued; later passes finish it, each order once", async () => {
    const { symbol, accountId } = await stock("1000000");
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push((await place(accountId, symbol, "1", `s${i}`, SATURDAY)).orderId);
    // A clock that says every admission cost 3 s, against a budget of 5 s: the pass starts two and stops.
    let ms = 0;
    const slow = () => (ms += 3000);
    const first = await pass({ batchSize: 100, budgetMs: 5000, clock: slow });
    expect(first.admitted).toBeGreaterThanOrEqual(1);
    expect(first.admitted).toBeLessThan(6);
    const remaining = (await Promise.all(ids.map(state))).filter((s) => s === "queued_for_open").length;
    expect(remaining).toBe(6 - first.admitted);
    for (let i = 0; i < 6; i += 1) {
      ms = 0;
      await pass({ budgetMs: 5000, clock: slow });
    }
    expect((await Promise.all(ids.map(state))).includes("queued_for_open")).toBe(false);
    for (const id of ids) expect(Number((await w.trading.query("SELECT count(*) AS n FROM trading.order_events WHERE order_id = $1 AND kind = 'accepted'", [id])).rows[0].n)).toBe(1);
  });

  it("an admission that times out in the database rolls back whole; the order stays queued and reserved, the error is counted, the next pass admits it", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "t1", SATURDAY);
    let failed = false;
    const timeout: Hooks = {
      at: (b) => {
        if (b === "admit:before-commit" && !failed) {
          failed = true;
          throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
        }
      },
    };
    const first = await pass({}, timeout);
    expect(first.errors).toBe(1);
    expect(first.admitted).toBe(0);
    expect(await state(orderId)).toBe("queued_for_open");
    expect(await w.buyingPower(accountId)).toBe("8950.00000000");
    const second = await pass();
    expect(second.admitted).toBe(1);
    expect(await state(orderId)).not.toBe("queued_for_open");
  });
});

describe("the price rule at release", () => {
  it("at the same close nothing changes: the reservation stays as the player saw it", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "p0", SATURDAY);
    const r = await pass();
    expect(r).toMatchObject({ admitted: 1, toppedUp: 0, admissionRejected: 0 });
    expect(await w.reservation(orderId)).toMatchObject({ reserved: "1050.00000000" });
  });

  it("a gap inside the ceiling (100 to 104 against a ceiling of 105) needs no top-up", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "p1", SATURDAY);
    await w.endOfDayPrice(symbol, "104", { ageHours: 1 });
    expect(await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).toMatchObject({ outcome: "admitted", toppedUp: null });
    expect(await w.reservation(orderId)).toMatchObject({ reserved: "1050.00000000" });
  });

  it("a gap above the ceiling (a new close of 120) tops the reservation up from buying power at the new ceiling, and the order then fills at 120", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "p2", SATURDAY);
    await w.endOfDayPrice(symbol, "120", { ageHours: 1 });
    const r = await pass();
    expect(r).toMatchObject({ admitted: 1, toppedUp: 1, admissionRejected: 0 });
    // New ceiling 120 x 1.05 = 126; 10 shares reserve 1,260, so 210 more than the 1,050 first held.
    expect(await w.reservation(orderId)).toMatchObject({ reserved: "1260.00000000" });
    expect(await w.buyingPower(accountId)).toBe("8740.00000000");
    for (let i = 0; i < 5; i += 1) await pass();
    expect(await state(orderId)).toBe("filled");
    expect((await w.trading.query("SELECT price::text FROM trading.fills WHERE order_id = $1", [orderId])).rows[0].price).toBe("120.00000000");
    const events = await w.trading.query("SELECT kind FROM trading.order_events WHERE order_id = $1 ORDER BY event_id", [orderId]);
    expect(events.rows.map((e) => e.kind)).toEqual(["queued_for_open", "topped_up", "accepted", "working", "fill", "released"]);
  });

  it("a gap that buying power cannot cover is rejected and the full reservation is released", async () => {
    const { symbol, accountId } = await stock("1100"); // 1,050 reserved leaves 50; the top-up needs 210
    const { orderId } = await place(accountId, symbol, "10", "p3", SATURDAY);
    expect(await w.buyingPower(accountId)).toBe("50.00000000");
    await w.endOfDayPrice(symbol, "120", { ageHours: 1 });
    const r = await pass();
    expect(r).toMatchObject({ admitted: 0, toppedUp: 0, admissionRejected: 1 });
    expect(await state(orderId)).toBe("rejected");
    expect(await w.reservation(orderId)).toMatchObject({ reserved: "1050.00000000", spent: "0.00000000", released: "1050.00000000" });
    expect(await w.buyingPower(accountId)).toBe("1100.00000000");
    expect(await w.count("fills", orderId)).toBe(0);
    expect(await w.order(orderId)).toMatchObject({ open_qty: "0.00000000", cancelled_qty: "10.00000000" });
  });

  it("a close that is stale at the open (older than the latest completed trading day) rejects the order and releases the reservation", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "p4", SATURDAY);
    await w.endOfDayPrice(symbol, "100", { ageHours: 1, staleClose: true });
    expect(await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).toMatchObject({ outcome: "rejected", reason: "stale-price", released: "1050.00000000" });
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
  });

  it("a top-up that is the exact buying power left is accepted; a hundredth short is not", async () => {
    const exact = await stock("1260");
    const a = await place(exact.accountId, exact.symbol, "10", "p5", SATURDAY);
    await w.endOfDayPrice(exact.symbol, "120", { ageHours: 1 });
    expect((await admitQueuedOrder(w.trading, a.orderId, MONDAY_OPEN)).outcome).toBe("admitted");
    expect(await w.buyingPower(exact.accountId)).toBe("0.00000000");

    const short = await stock("1259.99");
    const b = await place(short.accountId, short.symbol, "10", "p6", SATURDAY);
    await w.endOfDayPrice(short.symbol, "120", { ageHours: 1 });
    expect(await admitQueuedOrder(w.trading, b.orderId, MONDAY_OPEN)).toMatchObject({ outcome: "rejected", reason: "insufficient-buying-power-at-open" });
    expect(await w.buyingPower(short.accountId)).toBe("1259.99000000");
  });
});

describe("cancel before the open", () => {
  it("cancels at once and returns the full reservation, with no venue involved", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "x1", SATURDAY);
    expect(await cancelPlayerOrder(w.trading, accountId, orderId, at(SATURDAY, 60))).toBe("cancelled");
    expect(await state(orderId)).toBe("cancelled");
    expect(await w.order(orderId)).toMatchObject({ open_qty: "0.00000000", cancelled_qty: "10.00000000" });
    expect(await w.reservation(orderId)).toMatchObject({ released: "1050.00000000" });
    expect(await w.buyingPower(accountId)).toBe("10000.00000000");
    expect(await cancelPlayerOrder(w.trading, accountId, orderId, at(SATURDAY, 120))).toBe("already");
    // The open then finds nothing to admit.
    expect((await pass()).admitted).toBe(0);
  });

  it("someone else's queued order is not theirs to cancel", async () => {
    const { symbol, accountId } = await stock("10000");
    const other = await w.account("10000");
    const { orderId } = await place(accountId, symbol, "10", "x2", SATURDAY);
    expect(await cancelPlayerOrder(w.trading, other, orderId, SATURDAY)).toBe("not-found");
    expect(await state(orderId)).toBe("queued_for_open");
  });

  it("a cancel that races the admission ends one way or the other, never both, and the money adds up", async () => {
    const { symbol, accountId } = await stock("1000000");
    for (let i = 0; i < 6; i += 1) {
      const { orderId } = await place(accountId, symbol, "2", `race${i}`, SATURDAY);
      const [cancel, admit] = await Promise.all([cancelPlayerOrder(w.trading, accountId, orderId, MONDAY_OPEN), admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)]);
      const final = await state(orderId);
      if (admit.outcome === "admitted") expect(["accepted", "cancel_requested", "cancelled"]).toContain(final);
      else expect(final).toBe("cancelled");
      expect(["cancelled", "requested", "already"]).toContain(cancel);
    }
    for (let i = 0; i < 8; i += 1) await pass();
  });
});

describe("weekends, holidays and the clock change", () => {
  it("a Friday evening order waits through the weekend and is admitted at Monday 9:30, not before", async () => {
    const { symbol, accountId } = await stock("10000");
    const friday = new Date("2026-11-13T23:00:00Z"); // 18:00 ET
    const { orderId } = await place(accountId, symbol, "10", "w1", friday);
    expect(await state(orderId)).toBe("queued_for_open");
    for (const closed of ["2026-11-14T15:00:00Z", "2026-11-15T15:00:00Z", "2026-11-16T14:29:59Z"]) expect((await admitQueuedOrder(w.trading, orderId, new Date(closed))).outcome).toBe("not-open");
    expect((await admitQueuedOrder(w.trading, orderId, MONDAY_OPEN)).outcome).toBe("admitted");
  });

  it("an order placed on Thanksgiving waits for Friday the 27th, not Thursday", async () => {
    const { symbol, accountId } = await stock("10000");
    const thanksgiving = new Date("2026-11-26T16:00:00Z"); // 11:00 ET, a weekday, closed
    const { orderId } = await place(accountId, symbol, "10", "w2", thanksgiving);
    expect(await state(orderId)).toBe("queued_for_open");
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-11-26T14:30:00Z"))).outcome).toBe("not-open");
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-11-27T14:30:00Z"))).outcome).toBe("admitted");
  });

  it("an order placed after an early close (13:00 ET the day after Thanksgiving) is queued for the next trading day", async () => {
    const { symbol, accountId } = await stock("10000");
    const afterEarlyClose = new Date("2026-11-27T19:00:00Z"); // 14:00 ET
    const { orderId } = await place(accountId, symbol, "10", "w3", afterEarlyClose);
    expect(await state(orderId)).toBe("queued_for_open");
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-11-30T14:30:00Z"))).outcome).toBe("admitted");
  });

  it("across the spring clock change the open moves from 14:30Z to 13:30Z: an order is admitted at 13:30Z, not at 13:29:59Z", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "d1", new Date("2026-03-06T23:00:00Z")); // Friday before the change
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-03-09T13:29:59Z"))).outcome).toBe("not-open");
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-03-09T13:30:00Z"))).outcome).toBe("admitted");
  });

  it("across the autumn clock change the open is back to 14:30Z", async () => {
    const { symbol, accountId } = await stock("10000");
    const { orderId } = await place(accountId, symbol, "10", "d2", new Date("2026-10-30T23:00:00Z"));
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-11-02T13:30:00Z"))).outcome).toBe("not-open"); // 8:30 ET: still closed
    expect((await admitQueuedOrder(w.trading, orderId, new Date("2026-11-02T14:30:00Z"))).outcome).toBe("admitted");
  });
});
