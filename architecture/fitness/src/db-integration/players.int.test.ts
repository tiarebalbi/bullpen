import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { STARTING_CASH, createPool, ensurePlayerAccount, neutralHandle } from "@bullpen/db-trading";

const pool = createPool(inject("dbUrls").tradingOwner, 8);
afterAll(() => pool.end());

describe("ensurePlayerAccount", () => {
  it("makes one account on first sign-in with the starting cash and a neutral handle, and returns the same one after", async () => {
    const userId = `user-${randomUUID()}`;
    const first = await ensurePlayerAccount(pool, userId);
    expect(first.created).toBe(true);
    expect(first.handle).toBe(neutralHandle(userId));
    const row = (await pool.query<{ buying_power: string; owner_user_id: string }>("SELECT buying_power::text, owner_user_id FROM trading.accounts WHERE account_id = $1", [first.accountId])).rows[0]!;
    expect(row.buying_power).toBe(`${STARTING_CASH}.00000000`);
    expect(row.owner_user_id).toBe(userId);
    const again = await ensurePlayerAccount(pool, userId);
    expect(again).toEqual({ accountId: first.accountId, handle: first.handle, created: false });
  });

  it("makes exactly one account when the same user signs in from two places at once", async () => {
    const userId = `user-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 6 }, () => ensurePlayerAccount(pool, userId)));
    expect(new Set(results.map((r) => r.accountId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect((await pool.query("SELECT 1 FROM trading.accounts WHERE owner_user_id = $1", [userId])).rowCount).toBe(1);
  });

  it("takes a longer handle when the short one is taken by someone else, and never stores the user id in it", async () => {
    const userId = `user-${randomUUID()}`;
    await pool.query("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 1)", [neutralHandle(userId, 4)]);
    const account = await ensurePlayerAccount(pool, userId);
    expect(account.handle).toBe(neutralHandle(userId, 5));
    expect(account.handle).not.toContain(userId);
    // the squatter was a test row: remove it so the leaderboard tests see none
    await pool.query("DELETE FROM trading.accounts WHERE handle = $1 AND owner_user_id IS NULL", [neutralHandle(userId, 4)]);
  });

  it("gives two users two accounts", async () => {
    const [a, b] = await Promise.all([ensurePlayerAccount(pool, `user-${randomUUID()}`), ensurePlayerAccount(pool, `user-${randomUUID()}`)]);
    expect(a.accountId).not.toBe(b.accountId);
  });
});
