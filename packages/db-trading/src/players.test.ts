import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { STARTING_CASH, findPlayerAccount, neutralHandle } from "./players.js";

describe("neutralHandle", () => {
  it("is 'Player' and four hex characters, the same for the same user", () => {
    expect(neutralHandle("user-123")).toMatch(/^Player [0-9A-F]{4}$/);
    expect(neutralHandle("user-123")).toBe(neutralHandle("user-123"));
  });

  it("takes more of the hash when asked, and the shorter label is the start of the longer", () => {
    const four = neutralHandle("user-123", 4).replace("Player ", "");
    expect(neutralHandle("user-123", 6)).toBe(`Player ${four}${neutralHandle("user-123", 6).slice(-2)}`);
    expect(neutralHandle("user-123", 6)).toMatch(/^Player [0-9A-F]{6}$/);
  });

  it("does not contain the user id, so it names nothing a sign-in knows", () => {
    expect(neutralHandle("octocat-the-login")).not.toMatch(/octocat|login/i);
  });
});

describe("STARTING_CASH", () => {
  it("is 100,000 in play money, as one decimal string", () => {
    expect(STARTING_CASH).toBe("100000");
  });
});

describe("findPlayerAccount", () => {
  const poolWith = (rows: unknown[]) => {
    const query = vi.fn().mockResolvedValue({ rows });
    return { pool: { query } as unknown as Pool, query };
  };

  it("gives the account of a user who has one", async () => {
    const { pool } = poolWith([{ account_id: "acc-1", handle: "Player 4F2A" }]);
    expect(await findPlayerAccount(pool, "user-1")).toEqual({ accountId: "acc-1" });
  });

  it("gives null for a user with no account, and makes none: it only ever reads", async () => {
    const { pool, query } = poolWith([]);
    expect(await findPlayerAccount(pool, "user-1")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]![0])).toMatch(/^SELECT /);
  });
});
