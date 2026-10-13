import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { BuyRefused, createPool as createTradingPool, placeMarketBuy } from "@bullpen/db-trading";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";

const urls = inject("dbUrls");
const trading = createTradingPool(urls.tradingOwner, 16);
const marketData = createMarketDataPool(urls.marketDataOwner);

const symbol = (): string => `T${randomUUID().slice(0, 8).toUpperCase()}`;

/** A throwaway account, price and nothing else: tests seed their own rows and never a deployed database. */
async function seed(buyingPower: string, price: string, stale = false): Promise<{ accountId: string; symbol: string }> {
  const sym = symbol();
  await marketData.query(
    `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until)
     VALUES ($1, now() - interval '1 minute', $2, 'test', now() ${stale ? "- interval '1 second'" : "+ interval '1 hour'"})`,
    [sym, price],
  );
  const account = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, $2) RETURNING account_id", [`player-${randomUUID()}`, buyingPower]);
  return { accountId: account.rows[0]!.account_id, symbol: sym };
}

/** Holds each caller until `parties` have arrived, so concurrent buys are provably inside their transactions at the same time. */
function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => (release = resolve));
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await open;
  };
}

/** The refusal a buy fails with; fails the test if the buy goes through or fails some other way. */
async function refusal(buy: Promise<unknown>): Promise<BuyRefused> {
  const error = await buy.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BuyRefused);
  return error as BuyRefused;
}

const counts = async (accountId: string) => {
  const q = async (sql: string) => Number((await trading.query<{ n: string }>(sql, [accountId])).rows[0]!.n);
  return {
    orders: await q("SELECT count(*) AS n FROM trading.orders WHERE account_id = $1"),
    ledger: await q("SELECT count(*) AS n FROM trading.ledger WHERE account_id = $1"),
    positions: await q("SELECT count(*) AS n FROM trading.positions WHERE account_id = $1"),
  };
};
const buyingPower = async (accountId: string): Promise<string> => (await trading.query<{ b: string }>("SELECT buying_power::text AS b FROM trading.accounts WHERE account_id = $1", [accountId])).rows[0]!.b;

afterAll(async () => {
  await trading.end();
  await marketData.end();
});

describe("a buy is one transaction", () => {
  it("writes the order and its ledger entries together, updates the position and the buying power, and commits", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100");
    const fill = await placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" });

    expect(fill).toMatchObject({ symbol: sym, quantity: "4", cost: "400.00000000", buyingPower: "600.00000000" });
    expect(await counts(accountId)).toEqual({ orders: 1, ledger: 2, positions: 1 });
    const ledger = await trading.query("SELECT asset, delta::float AS delta FROM trading.ledger WHERE account_id = $1 ORDER BY entry_id", [accountId]);
    expect(ledger.rows).toEqual([
      { asset: "USD", delta: -400 },
      { asset: sym, delta: 4 },
    ]);
    expect((await trading.query("SELECT quantity::float AS q FROM trading.positions WHERE account_id = $1", [accountId])).rows).toEqual([{ q: 4 }]);
  });

  it("rolls back every write when a failure is injected after the order insert: no order, no ledger entry, no reservation", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100");
    await expect(
      placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" }, { afterOrderInsert: () => { throw new Error("injected failure after the order insert"); } }),
    ).rejects.toThrow("injected failure after the order insert");

    expect(await counts(accountId)).toEqual({ orders: 0, ledger: 0, positions: 0 });
    expect(await buyingPower(accountId)).toBe("1000.00000000");
  });

  it("leaves a connection that can be used again after a rollback", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100");
    await expect(placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" }, { afterOrderInsert: () => { throw new Error("boom"); } })).rejects.toThrow("boom");
    await expect(placeMarketBuy(trading, { accountId, symbol: sym, quantity: "4" })).resolves.toMatchObject({ buyingPower: "600.00000000" });
  });
});

describe("buying power is reserved by one conditional update", () => {
  it("lets exactly one of two concurrent buys commit when each fits but together they overspend", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100");
    const together = barrier(2);
    const results = await Promise.allSettled([
      placeMarketBuy(trading, { accountId, symbol: sym, quantity: "6" }, { afterPriceRead: together }),
      placeMarketBuy(trading, { accountId, symbol: sym, quantity: "6" }, { afterPriceRead: together }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(lost.reason).toBeInstanceOf(BuyRefused);
    expect((lost.reason as BuyRefused).reason).toBe("insufficient-buying-power");

    // The losing buy left no order, ledger entry or reservation: only the winner's writes exist.
    expect(await counts(accountId)).toEqual({ orders: 1, ledger: 2, positions: 1 });
    expect(await buyingPower(accountId)).toBe("400.00000000");
  });

  it("holds under many concurrent buyers: the account never goes below zero and every committed order is paid for", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100");
    const together = barrier(12);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => placeMarketBuy(trading, { accountId, symbol: sym, quantity: "3" }, { afterPriceRead: together })));
    const won = results.filter((r) => r.status === "fulfilled").length;

    expect(won).toBe(3); // 3 x 300 = 900 <= 1000 < 4 x 300
    expect(await counts(accountId)).toEqual({ orders: won, ledger: won * 2, positions: 1 });
    expect(await buyingPower(accountId)).toBe("100.00000000");
  });

  it("keeps CHECK (buying_power >= 0) as a second guard", async () => {
    const { accountId } = await seed("10", "1");
    await expect(trading.query("UPDATE trading.accounts SET buying_power = -1 WHERE account_id = $1", [accountId])).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a buy the account cannot pay for, with a clear message and no writes", async () => {
    const { accountId, symbol: sym } = await seed("50", "100");
    const error = await refusal(placeMarketBuy(trading, { accountId, symbol: sym, quantity: "1" }));
    expect(error.message).toMatch(/^Refused: not enough buying power for 1 T[0-9A-F]{8} at 100\.00000000\.$/);
    expect(await counts(accountId)).toEqual({ orders: 0, ledger: 0, positions: 0 });
    expect(await buyingPower(accountId)).toBe("50.00000000");
  });

  it("refuses an account that does not exist", async () => {
    const { symbol: sym } = await seed("50", "1");
    await expect(placeMarketBuy(trading, { accountId: randomUUID(), symbol: sym, quantity: "1" })).rejects.toMatchObject({ reason: "unknown-account" });
  });
});

describe("a buy fills only at a current price", () => {
  it("refuses a buy at a stale price, naming the symbol and the time, and writes nothing", async () => {
    const { accountId, symbol: sym } = await seed("1000", "100", true);
    const error = await refusal(placeMarketBuy(trading, { accountId, symbol: sym, quantity: "1" }));

    expect(error.reason).toBe("stale-price");
    expect(error.message).toContain(`the latest price for ${sym} is stale (as of `);
    expect(error.message).toContain("I only fill at a current price.");
    expect(await counts(accountId)).toEqual({ orders: 0, ledger: 0, positions: 0 });
    expect(await buyingPower(accountId)).toBe("1000.00000000");
  });

  it("refuses a symbol that has no price yet", async () => {
    const { accountId } = await seed("1000", "100");
    await expect(placeMarketBuy(trading, { accountId, symbol: "NOPRICE", quantity: "1" })).rejects.toMatchObject({ reason: "no-price" });
  });
});

describe("the trading owner still cannot read market_data tables while buying", () => {
  it("fills through prices_v1 only: the buy's role has no grant on the quotes table", async () => {
    const client = new pg.Client({ connectionString: urls.tradingOwner });
    await client.connect();
    await expect(client.query("SELECT * FROM market_data.quotes")).rejects.toMatchObject({ code: "42501" });
    await client.end();
  });
});
