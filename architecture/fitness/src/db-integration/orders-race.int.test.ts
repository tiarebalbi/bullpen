/**
 * Experiment 1 (Decision 2): the cancel that races fills. The venue's ordering rules are in ADR-0017. Every run makes
 * its own account, order and price, delivers a set of events in some order, and checks the invariants and the final
 * state the rules predict. A final status that merely looks plausible is not a pass: the invariants are.
 *
 * Two parts: an exhaustive enumeration of every allowed delivery order for small plans, and seeded random runs that
 * deliver events concurrently, with duplicate deliveries and crashes at named boundaries.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { CrashError, LATE_FILL_WINDOW_MS, bookFill, checkOrderInvariants, confirmCancel, markWorking, releaseReservation, requestCancel, seeded, submitOrder, type Boundary, type Hooks } from "@bullpen/db-trading";
import { world } from "./orders-harness.js";

const w = world(inject("dbUrls"), 24);
afterAll(() => w.close());
// The whole file's accounts (about 10,000 after the exhaustive part) are checked at the end of each test, which takes a while on a busy machine.
afterEach(() => w.assertInvariants(), 300_000);

const T0 = new Date("2026-10-20T12:00:00.000Z");
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const FAR = at(60 * 60_000);
const QTY = 10;
const PRICE = 100;

type Ev = { kind: "fill" | "dup"; i: number } | { kind: "cancel" } | { kind: "ack" } | { kind: "release" };
const label = (e: Ev): string => (e.kind === "fill" ? `F${e.i + 1}` : e.kind === "dup" ? `D${e.i + 1}` : e.kind === "cancel" ? "C" : e.kind === "ack" ? "A" : "R");

interface Plan {
  /** The fills that exist: executed before the cancel took effect. */
  fills: { qty: number; executedMs: number }[];
  requestMs: number;
  effectiveMs: number;
}

const BOUNDARIES: Record<Ev["kind"], Boundary[]> = {
  fill: ["fill:after-fill-row", "fill:after-ledger", "fill:before-commit", "fill:after-commit"],
  dup: ["fill:after-fill-row", "fill:after-ledger", "fill:before-commit", "fill:after-commit"],
  cancel: ["cancel:before-commit", "cancel:after-commit"],
  ack: ["cancel:after-commit"],
  release: ["release:before-update", "release:after-commit"],
};

async function start(): Promise<{ accountId: string; orderId: string; orderIdSymbol: string }> {
  const symbol = w.symbol();
  await w.price(symbol, String(PRICE));
  const accountId = await w.account("10000");
  const order = await submitOrder(w.trading, { accountId, symbol, quantity: String(QTY), clientOrderId: `r-${symbol}` });
  await markWorking(w.trading, order.orderId);
  return { accountId, orderId: order.orderId, orderIdSymbol: symbol };
}

/** Delivers one event. With `crash`, the process "dies" once at that boundary and the event is delivered again. */
async function deliver(orderId: string, plan: Plan, ev: Ev, crash?: Boundary): Promise<void> {
  let fired = false;
  const hooks: Hooks = { at: (b) => { if (crash && b === crash && !fired) { fired = true; throw new CrashError(b); } } };
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (ev.kind === "fill" || ev.kind === "dup") {
        const f = plan.fills[ev.i]!;
        await bookFill(w.trading, { fillId: `${orderId}:${ev.i}`, orderId, quantity: String(f.qty), price: String(PRICE), executedAt: at(f.executedMs) }, hooks);
      } else if (ev.kind === "cancel") await requestCancel(w.trading, orderId, at(plan.requestMs), hooks);
      else if (ev.kind === "ack") await confirmCancel(w.trading, orderId, at(plan.effectiveMs), hooks);
      else await releaseReservation(w.trading, orderId, FAR, hooks);
      return;
    } catch (error) {
      if (!(error instanceof CrashError) || attempt > 0) throw error;
    }
  }
}

/** What the rules predict once every event has been delivered and the reservation released. */
async function expectFinal(accountId: string, orderId: string, plan: Plan): Promise<string[]> {
  const problems = await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }]);
  const filled = plan.fills.reduce((n, f) => n + f.qty, 0);
  const order = await w.order(orderId);
  const state = filled === QTY ? "filled" : "cancelled";
  const want = { status: state, filled_qty: `${filled}.00000000`, open_qty: "0.00000000", cancelled_qty: `${QTY - filled}.00000000`, needs_attention: null };
  for (const [key, value] of Object.entries(want)) if (order[key] !== value) problems.push(`${key} is ${String(order[key])}, expected ${String(value)}`);
  const res = await w.reservation(orderId);
  if (!res.released_at) problems.push("reservation not released");
  const bp = await w.buyingPower(accountId);
  if (bp !== `${10000 - filled * PRICE}.00000000`) problems.push(`buying power ${bp}, expected ${10000 - filled * PRICE}`);
  return problems;
}

async function run(plan: Plan, order: Ev[][], crashes: (Boundary | undefined)[][]): Promise<string[]> {
  const { accountId, orderId } = await start();
  for (const [w_, wave] of order.entries()) await Promise.all(wave.map((ev, j) => deliver(orderId, plan, ev, crashes[w_]?.[j])));
  await releaseReservation(w.trading, orderId, FAR); // the sweep's last step, whatever the order the events came in
  return expectFinal(accountId, orderId, plan);
}

/** Every order of `events` that keeps `before` pairs in order. */
function* interleavings(events: Ev[], before: [number, number][]): Generator<Ev[]> {
  const used = new Array(events.length).fill(false) as boolean[];
  const picked: number[] = [];
  function* go(): Generator<Ev[]> {
    if (picked.length === events.length) return yield picked.map((i) => events[i]!);
    for (let i = 0; i < events.length; i += 1) {
      if (used[i] || before.some(([a, b]) => b === i && !used[a]!)) continue;
      used[i] = true;
      picked.push(i);
      yield* go();
      picked.pop();
      used[i] = false;
    }
  }
  yield* go();
}

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

const reportDir = process.env.PART4_REPORT_DIR;

describe("experiment 1: the cancel races the fills", () => {
  it("holds for every allowed delivery order of small plans (exhaustive)", async () => {
    const lines: string[] = [];
    const failures: string[] = [];
    let runs = 0;
    const planned = [
      { name: "sizes 4,3,2 (never fills the order)", sizes: [4, 3, 2] },
      { name: "sizes 4,3,3 (the fills complete the order)", sizes: [4, 3, 3] },
    ];
    for (const variant of planned) {
      for (const existing of [0, 1, 2, 3]) {
        const fills = variant.sizes.slice(0, existing).map((qty, i) => ({ qty, executedMs: 100 * (i + 1) }));
        const plan: Plan = { fills, requestMs: 100 * existing + 40, effectiveMs: 100 * existing + 50 };
        const dupChoices = existing === 0 ? [-1] : fills.map((_, i) => i);
        for (const dup of dupChoices) {
          const events: Ev[] = [...fills.map((_, i): Ev => ({ kind: "fill", i })), { kind: "cancel" }, { kind: "ack" }, { kind: "release" }];
          if (dup >= 0) events.push({ kind: "dup", i: dup });
          const idx = (pred: (e: Ev) => boolean) => events.findIndex(pred);
          const before: [number, number][] = [[idx((e) => e.kind === "cancel"), idx((e) => e.kind === "ack")]];
          if (dup >= 0) before.push([idx((e) => e.kind === "fill" && e.i === dup), idx((e) => e.kind === "dup")]);
          const orders = [...interleavings(events, before)];
          await inBatches(orders, 12, async (ordering) => {
            const name = `${variant.name} | ${existing} fill(s) exist | ${ordering.map(label).join(",")}`;
            runs += 1;
            lines.push(name);
            const problems = await run(plan, ordering.map((e) => [e]), []);
            if (problems.length) failures.push(`${name}: ${problems.join("; ")}`);
          });
        }
      }
    }
    console.log(`EXHAUSTIVE runs=${runs} failures=${failures.length}`);
    if (reportDir) {
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(`${reportDir}/race-exhaustive-interleavings.txt`, `${lines.sort().join("\n")}\n`);
      writeFileSync(`${reportDir}/race-exhaustive-summary.json`, `${JSON.stringify({ at: new Date().toISOString(), runs, failures: failures.length, distinctInterleavings: new Set(lines).size }, null, 2)}\n`);
    }
    expect(failures).toEqual([]);
    expect(runs).toBeGreaterThan(1000);
  }, 900_000);

  it("holds for seeded random plans delivered concurrently, with duplicates and crashes", async () => {
    const SEEDS = Number(process.env.PART4_RACE_SEEDS ?? 1500);
    const failures: string[] = [];
    let crashesInjected = 0;
    let concurrentWaves = 0;
    let doubleDeliveries = 0;
    const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
    await inBatches(seeds, 10, async (seed) => {
      const rng = seeded(seed);
      const k = 1 + Math.floor(rng() * 4);
      const fills: Plan["fills"] = [];
      let left = QTY;
      for (let i = 0; i < k && left > 0; i += 1) {
        const qty = i === k - 1 && rng() < 0.5 ? left : 1 + Math.floor(rng() * Math.max(1, Math.min(left, 5)));
        fills.push({ qty: Math.min(qty, left), executedMs: 100 * (i + 1) });
        left -= fills[i]!.qty;
      }
      const existing = Math.floor(rng() * (fills.length + 1));
      const live = fills.slice(0, existing);
      const plan: Plan = { fills: live, requestMs: 100 * existing + 40, effectiveMs: 100 * existing + 50 };
      const events: Ev[] = live.map((_, i): Ev => ({ kind: "fill", i }));
      for (let i = 0; i < live.length; i += 1) if (rng() < 0.5) events.push({ kind: "dup", i });
      events.push({ kind: "cancel" }, { kind: "ack" });
      for (let i = rng() < 0.6 ? 1 : 0; i > 0; i -= 1) events.push({ kind: "release" });
      // a random order that keeps the cancel before its confirmation
      for (let i = events.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [events[i], events[j]] = [events[j]!, events[i]!];
      }
      const c = events.findIndex((e) => e.kind === "cancel");
      const a = events.findIndex((e) => e.kind === "ack");
      if (a < c) [events[a], events[c]] = [events[c]!, events[a]!];
      // waves of 1 to 3 events delivered at the same moment; the cancel's wave closes before the confirmation's opens
      const waves: Ev[][] = [];
      for (let i = 0; i < events.length; ) {
        const size = 1 + Math.floor(rng() * 3);
        const wave = events.slice(i, i + size);
        const cut = wave.findIndex((e) => e.kind === "cancel");
        const taken = cut >= 0 && cut < wave.length - 1 ? wave.slice(0, cut + 1) : wave;
        waves.push(taken);
        i += taken.length;
      }
      const crashes = waves.map((wave) => wave.map((ev) => (rng() < 0.3 ? BOUNDARIES[ev.kind][Math.floor(rng() * BOUNDARIES[ev.kind].length)] : undefined)));
      crashesInjected += crashes.flat().filter(Boolean).length;
      concurrentWaves += waves.filter((wave) => wave.length > 1).length;
      doubleDeliveries += events.filter((e) => e.kind === "dup").length;
      const problems = await run(plan, waves, crashes);
      if (problems.length) failures.push(`seed ${seed} [${waves.map((wave) => wave.map(label).join("+")).join(" ")}]: ${problems.join("; ")}`);
    });
    console.log(`RANDOM seeds=1..${SEEDS} runs=${SEEDS} failures=${failures.length} crashes_injected=${crashesInjected} concurrent_waves=${concurrentWaves} duplicate_deliveries=${doubleDeliveries} late_fill_window_ms=${LATE_FILL_WINDOW_MS}`);
    if (reportDir) {
      writeFileSync(`${reportDir}/race-random-summary.json`, `${JSON.stringify({ at: new Date().toISOString(), seeds: `1..${SEEDS}`, runs: SEEDS, failures: failures.length, crashesInjected, concurrentWaves, duplicateDeliveries: doubleDeliveries, lateFillWindowMs: LATE_FILL_WINDOW_MS }, null, 2)}\n`);
    }
    expect(failures).toEqual([]);
  }, 900_000);

  it("the invariant checks can fail: a corrupted account is reported", async () => {
    const { accountId, orderId } = await start();
    expect(await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }])).toEqual([]);
    await w.trading.query("UPDATE trading.accounts SET buying_power = buying_power + 1 WHERE account_id = $1", [accountId]);
    expect((await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }])).join()).toMatch(/cash does not add up/);
    await w.trading.query("UPDATE trading.accounts SET buying_power = buying_power - 1 WHERE account_id = $1", [accountId]);
    await w.trading.query("INSERT INTO trading.positions (account_id, symbol, quantity) VALUES ($1, 'ZZZZ', 3)", [accountId]);
    expect((await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }])).join()).toMatch(/position .* is 3/);
    await w.trading.query("DELETE FROM trading.positions WHERE account_id = $1", [accountId]);
    await w.trading.query("UPDATE trading.orders SET filled_qty = 1, open_qty = open_qty - 1 WHERE order_id = $1", [orderId]);
    expect((await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }])).join()).toMatch(/shows 1.* filled but its booked fills/);
    await w.trading.query("UPDATE trading.orders SET filled_qty = 0, open_qty = quantity WHERE order_id = $1", [orderId]);
    expect(await checkOrderInvariants(w.trading, [{ accountId, startingCash: "10000" }])).toEqual([]);
  });
});
