import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";
import { STARTING_CASH, createPool, ensurePlayerAccount, findPlayerAccount, neutralHandle } from "@bullpen/db-trading";

const urls = inject("dbUrls");
const pool = createPool(urls.tradingOwner, 8);
// The same role, in sessions that may only read: a statement that writes fails with 25006 (read_only_sql_transaction).
const readOnly = new pg.Pool({ connectionString: urls.tradingOwner, max: 2, options: "-c default_transaction_read_only=on" });
afterAll(async () => {
  await readOnly.end();
  await pool.end();
});

const accountCount = async (): Promise<number> => Number((await pool.query<{ n: string }>("SELECT count(*) AS n FROM trading.accounts")).rows[0]!.n);

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

describe("findPlayerAccount", () => {
  it("finds the account for a given user id: the one ensurePlayerAccount made, and only its id", async () => {
    const userId = `user-${randomUUID()}`;
    const made = await ensurePlayerAccount(pool, userId);
    expect(await findPlayerAccount(pool, userId)).toEqual({ accountId: made.accountId });
  });

  it("returns nothing for an unknown user, and makes no account for them", async () => {
    const before = await accountCount();
    expect(await findPlayerAccount(pool, `user-${randomUUID()}`)).toBeNull();
    expect(await accountCount()).toBe(before);
  });

  it("never returns another player's account: each user gets their own, and a look-alike id gets none", async () => {
    const a = `user-${randomUUID()}`;
    const b = `user-${randomUUID()}`;
    const [accountA, accountB] = await Promise.all([ensurePlayerAccount(pool, a), ensurePlayerAccount(pool, b)]);
    expect(accountA.accountId).not.toBe(accountB.accountId);
    expect(await findPlayerAccount(pool, a)).toEqual({ accountId: accountA.accountId });
    expect(await findPlayerAccount(pool, b)).toEqual({ accountId: accountB.accountId });
    // The id is matched exactly: not by prefix, by case, by a pattern or by anything that merely looks like it.
    for (const lookAlike of [a.slice(0, -1), `${a}x`, a.toUpperCase(), "user-%", "%", "_", `${a} `, ""]) {
      expect(await findPlayerAccount(pool, lookAlike)).toBeNull();
    }
  });

  it("needs only trading_owner's read rights: it works in a session that may not write, which refuses a write", async () => {
    const userId = `user-${randomUUID()}`;
    const made = await ensurePlayerAccount(pool, userId);
    // The session really is read-only: an insert is refused.
    await expect(readOnly.query("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 1)", [`blocked-${randomUUID()}`])).rejects.toMatchObject({ code: "25006" });
    // And the lookup, a read, goes through, for a user who has an account and for one who has not.
    const before = await accountCount();
    expect(await findPlayerAccount(readOnly, userId)).toEqual({ accountId: made.accountId });
    expect(await findPlayerAccount(readOnly, `user-${randomUUID()}`)).toBeNull();
    expect(await accountCount()).toBe(before);
  });

  it("runs as trading_owner, which holds the one right it needs: SELECT on trading.accounts", async () => {
    const asOwner = new pg.Client({ connectionString: urls.tradingOwner });
    await asOwner.connect();
    try {
      expect((await asOwner.query<{ current_user: string }>("SELECT current_user")).rows[0]!.current_user).toBe("trading_owner");
      // The function's one statement is a SELECT on trading.accounts, and the role holds that right.
      const rights = await asOwner.query<{ ok: boolean }>("SELECT has_table_privilege('trading_owner', 'trading.accounts', 'SELECT') AS ok");
      expect(rights.rows[0]!.ok).toBe(true);
    } finally {
      await asOwner.end();
    }
  });
});
