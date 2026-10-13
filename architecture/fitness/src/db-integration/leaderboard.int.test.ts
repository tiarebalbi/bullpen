import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { createPool as createTradingPool, placeMarketBuy, readLeaderboard, refreshLeaderboard, serveLeaderboard } from "@bullpen/db-trading";
import { formatViolation } from "../violation.js";
import { checkLeaderboardReconciliation } from "./reconcile-check.js";

const urls = inject("dbUrls");
const trading = createTradingPool(urls.tradingOwner, 8);
const marketData = createMarketDataPool(urls.marketDataOwner);
afterAll(async () => {
  await trading.end();
  await marketData.end();
});

const MIN = 60_000;

async function account(buyingPower: string): Promise<{ accountId: string; handle: string }> {
  const handle = `player-${randomUUID()}`;
  const { rows } = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, $2) RETURNING account_id", [handle, buyingPower]);
  return { accountId: rows[0]!.account_id, handle };
}
async function price(symbol: string, value: string): Promise<void> {
  await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), $2, 'test', now() + interval '1 hour')", [symbol, value]);
}
const symbol = (): string => `L${randomUUID().slice(0, 7).toUpperCase()}`;
const ageTheView = (minutes: number): Promise<unknown> => trading.query("UPDATE trading.leaderboard_refresh SET refreshed_at = now() - make_interval(mins => $1)", [minutes]);

describe("reading the leaderboard: no reader waits for a refresh", () => {
  it("a fresh read returns the ranking with its as-of time and starts no refresh", async () => {
    await refreshLeaderboard(trading);
    const scheduled: unknown[] = [];
    const read = await serveLeaderboard(trading, { schedule: (work) => scheduled.push(work) });

    expect(read.stale).toBe(false);
    expect(read.ageMs).toBeLessThan(MIN);
    expect(read.asOf).toBeInstanceOf(Date);
    expect(scheduled).toHaveLength(0);
  });

  it("a stale read returns the current ranking at once, then starts one refresh after the response", async () => {
    const sym = symbol();
    const { accountId } = await account("1000");
    await price(sym, "10");
    await ageTheView(6); // older than 5 minutes
    const before = await readLeaderboard(trading);
    const scheduled: Array<() => Promise<unknown>> = [];

    const read = await serveLeaderboard(trading, { schedule: (work) => scheduled.push(work) });

    expect(read.stale).toBe(true);
    expect(read.ageMs).toBeGreaterThan(5 * MIN);
    expect(read.rows).toEqual(before.rows); // the ranking as it was: it did not wait for the refresh
    expect(read.rows.some((row) => row.accountId === accountId)).toBe(false); // an account created since is not in it yet
    expect(scheduled).toHaveLength(1);

    expect(await scheduled[0]!()).toBe("refreshed");
    const after = await serveLeaderboard(trading, { schedule: () => undefined });
    expect(after.stale).toBe(false);
    expect(after.rows.some((row) => row.accountId === accountId)).toBe(true);
  });

  it("two readers that detect staleness at once start two refreshes of which exactly one runs", async () => {
    await ageTheView(6);
    const scheduled: Array<() => Promise<unknown>> = [];
    const schedule = (work: () => Promise<unknown>): void => void scheduled.push(work);
    await Promise.all([serveLeaderboard(trading, { schedule }), serveLeaderboard(trading, { schedule })]);
    expect(scheduled).toHaveLength(2);

    // The first refresh holds the lock until the second has tried and skipped.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let running = 0;
    const first = refreshLeaderboard(trading, { afterLock: async () => { running += 1; await held; } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await refreshLeaderboard(trading, { afterLock: () => { running += 1; } });
    release();

    expect(second).toBe("skipped");
    expect(await first).toBe("refreshed");
    expect(running).toBe(1);
  });

  it("a failed refresh leaves the last good ranking and its age, and records the failure", async () => {
    await refreshLeaderboard(trading);
    await ageTheView(7);
    const before = await readLeaderboard(trading);

    const outcome = await refreshLeaderboard(trading, { afterLock: () => { throw new Error("injected refresh failure"); } });
    const after = await readLeaderboard(trading);

    expect(outcome).toBe("failed");
    expect(after.rows).toEqual(before.rows);
    expect(after.asOf).toEqual(before.asOf); // the as-of time did not move: the UI shows the age of the last good ranking
    expect(after.stale).toBe(true);
    expect(after.lastFailure).toMatchObject({ error: "injected refresh failure" });

    expect(await refreshLeaderboard(trading)).toBe("refreshed"); // a later refresh heals it and clears the failure
    expect((await readLeaderboard(trading)).lastFailure).toBeNull();
  });
});

describe("the reconciliation check: the view equals the ranking computed on read", () => {
  it("passes for a fresh view after a fill and a refresh", async () => {
    const sym = symbol();
    const { accountId } = await account("1000");
    await price(sym, "100");
    await placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" });
    await refreshLeaderboard(trading);

    expect(await checkLeaderboardReconciliation(trading)).toEqual([]);
  });

  it("fails for a fill after the last refresh and before the next, naming the account and both values", async () => {
    const sym = symbol();
    const { accountId, handle } = await account("1000");
    await price(sym, "100");
    await refreshLeaderboard(trading); // the view knows the account with 1000 cash and no positions
    await placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" }); // a fill after the last refresh

    const violations = await checkLeaderboardReconciliation(trading);
    const mine = violations.filter((v) => v.why.includes(accountId));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.why).toContain(`Account "${handle}"`);
    expect(mine[0]!.why).toContain("equity 1000.00000000 (cash 1000.00000000, positions 0.00000000) in the view");
    expect(mine[0]!.why).toContain("equity 1000.00000000 (cash 600.00000000, positions 400.00000000) computed from the source tables");
    console.log(`\nreconciliation, fill after the last refresh:\n${formatViolation(mine[0]!)}\n`);

    await refreshLeaderboard(trading);
    expect(await checkLeaderboardReconciliation(trading)).toEqual([]);
  });

  it("fails for a tampered view row, naming the account and both values", async () => {
    const { accountId, handle } = await account("1000");
    await refreshLeaderboard(trading);
    await trading.query("DROP TABLE IF EXISTS trading.leaderboard_tampered");
    await trading.query("CREATE TABLE trading.leaderboard_tampered AS SELECT * FROM trading.leaderboard_mv");
    await trading.query("UPDATE trading.leaderboard_tampered SET equity = 9999, cash = 9999 WHERE account_id = $1", [accountId]);

    const violations = await checkLeaderboardReconciliation(trading, "trading.leaderboard_tampered");
    await trading.query("DROP TABLE trading.leaderboard_tampered");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.where).toBe("trading.leaderboard_tampered");
    expect(violations[0]!.why).toContain(`Account "${handle}" (${accountId})`);
    expect(violations[0]!.why).toContain("equity 9999.00000000 (cash 9999.00000000, positions 0.00000000) in the view");
    expect(violations[0]!.why).toContain("equity 1000.00000000 (cash 1000.00000000, positions 0.00000000) computed from the source tables");
    console.log(`\nreconciliation, tampered view row:\n${formatViolation(violations[0]!)}\n`);
  });

  it("fails when a price moves after the last refresh", async () => {
    const sym = symbol();
    const { accountId } = await account("1000");
    await price(sym, "100");
    await placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" });
    await refreshLeaderboard(trading);
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() + interval '1 second', 150, 'test', now() + interval '1 hour')", [sym]);

    const mine = (await checkLeaderboardReconciliation(trading)).filter((v) => v.why.includes(accountId));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.why).toContain("positions 400.00000000");
    expect(mine[0]!.why).toContain("positions 600.00000000");
    await refreshLeaderboard(trading);
  });
});
