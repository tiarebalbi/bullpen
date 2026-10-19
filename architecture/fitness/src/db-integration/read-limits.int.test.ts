import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { LEADERBOARD_TOP, TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE, createPool as createTradingPool, readLeaderboard, readLeaderboardRows, readPrices, refreshLeaderboard } from "@bullpen/db-trading";

const urls = inject("dbUrls");
const trading = createTradingPool(urls.tradingOwner, 8);
const marketData = createMarketDataPool(urls.marketDataOwner);
afterAll(async () => {
  await trading.end();
  await marketData.end();
});

const sym = (): string => `R${randomUUID().slice(0, 7).toUpperCase()}`;
/** `count` accounts with cash `cash`, handles starting `prefix`; returns their ids. */
async function accounts(count: number, cash: string, prefix = "player-"): Promise<string[]> {
  const tag = randomUUID().slice(0, 8);
  const { rows } = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) SELECT $1 || $2 || '-' || g, $3 FROM generate_series(1, $4) g RETURNING account_id", [prefix, tag, cash, count]);
  return rows.map((r) => r.account_id);
}

describe("the leaderboard read is capped", () => {
  it("returns the top rows and never the whole ranking, and says how many are ranked", async () => {
    await accounts(LEADERBOARD_TOP + 25, "5");
    await refreshLeaderboard(trading);
    const read = await readLeaderboard(trading);
    expect(read.rows).toHaveLength(LEADERBOARD_TOP);
    expect(read.total).toBeGreaterThanOrEqual(LEADERBOARD_TOP + 25);
  });

  it("never returns more than the cap even when asked for more", async () => {
    await refreshLeaderboard(trading);
    expect((await readLeaderboard(trading, new Date(), undefined, { limit: 10_000 })).rows.length).toBeLessThanOrEqual(LEADERBOARD_TOP);
    expect((await readLeaderboard(trading, new Date(), undefined, { limit: 3 })).rows).toHaveLength(3);
  });

  it("adds the caller's own row when it ranks below the top, and only once when it is in the top", async () => {
    const [low] = await accounts(1, "0.00000001");
    const [high] = await accounts(1, "999999");
    await refreshLeaderboard(trading);

    const read = await readLeaderboard(trading, new Date(), undefined, { accountId: low });
    expect(read.rows.filter((r) => r.accountId === low)).toHaveLength(1);
    expect(read.rows.length).toBeLessThanOrEqual(LEADERBOARD_TOP + 1);
    expect(read.rows.at(-1)!.accountId).toBe(low);
    expect(read.rows.at(-1)!.rank).toBeGreaterThan(LEADERBOARD_TOP);

    const top = await readLeaderboard(trading, new Date(), undefined, { accountId: high });
    expect(top.rows.filter((r) => r.accountId === high)).toHaveLength(1);
    expect(top.rows).toHaveLength(LEADERBOARD_TOP);
  });

  it("gives tied accounts the same rank, and skips the ranks they take", async () => {
    const [a, b] = await accounts(2, "888888.5");
    const [c] = await accounts(1, "888888");
    await refreshLeaderboard(trading);
    const read = await readLeaderboard(trading, new Date(), undefined, { accountId: c });
    const rank = (id: string) => read.rows.find((r) => r.accountId === id)!.rank;
    expect(rank(a!)).toBe(rank(b!));
    expect(rank(c!)).toBe(rank(a!) + 2);
  });
});

describe("test-marked rows stay out of what a page reads", () => {
  it("leaves a test-marked account out of the leaderboard and out of everyone's rank, unless asked", async () => {
    const [hidden] = await accounts(1, "7777777", TEST_HANDLE_PREFIX);
    const [visible] = await accounts(1, "7777776");
    await refreshLeaderboard(trading);

    const read = await readLeaderboard(trading, new Date(), undefined, { accountId: hidden });
    expect(read.rows.find((r) => r.accountId === hidden)).toBeUndefined();
    expect(read.rows.find((r) => r.accountId === visible)!.rank).toBe(1);
    expect((await readLeaderboardRows(trading)).some((r) => r.accountId === hidden)).toBe(true); // it is in the view: only the read hides it

    const all = await readLeaderboard(trading, new Date(), undefined, { includeTestRows: true });
    expect(all.rows.find((r) => r.accountId === hidden)!.rank).toBe(1);
    expect(all.rows.find((r) => r.accountId === visible)!.rank).toBe(2);
  });

  it("leaves a test-sourced quote out of the prices, unless asked, and keeps a real one", async () => {
    const fake = sym();
    const real = sym();
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), 10, $3, now() + interval '1 hour'), ($2, now(), 20, 'alphavantage', now() + interval '1 hour')", [fake, real, TEST_QUOTE_SOURCE]);

    const shown = (await readPrices(trading)).map((p) => p.symbol);
    expect(shown).not.toContain(fake);
    expect(shown).toContain(real);
    expect((await readPrices(trading, { includeTestRows: true })).map((p) => p.symbol)).toContain(fake);
  });
});

describe("what one read sends", () => {
  it("is a small fraction of the whole ranking's size", async () => {
    await accounts(2000, "1000");
    await refreshLeaderboard(trading);
    const whole = JSON.stringify({ rows: await readLeaderboardRows(trading) });
    const capped = JSON.stringify({ rows: (await readLeaderboard(trading)).rows });
    const total = (await readLeaderboard(trading)).total;
    console.log(`\nbytes per read, ${total} ranked accounts: whole ranking ${whole.length} B (${(whole.length / (total || 1)).toFixed(0)} B a row); capped read ${capped.length} B (${LEADERBOARD_TOP} rows)\n`);
    expect(capped.length).toBeLessThan(whole.length / 10);
    expect(capped.length).toBeLessThan(15_000);
  });
});
