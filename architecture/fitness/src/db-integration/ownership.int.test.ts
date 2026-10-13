import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { migrate as migrateMarketData } from "@bullpen/db-market-data";
import { migrate as migrateTrading } from "@bullpen/db-trading";

const urls = inject("dbUrls");
const clients: pg.Client[] = [];

async function as(connectionString: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  clients.push(client);
  return client;
}

/** The error a statement fails with, or undefined if it succeeds. */
async function failure(client: pg.Client, sql: string): Promise<(Error & { code?: string }) | undefined> {
  try {
    await client.query(sql);
    return undefined;
  } catch (error) {
    return error as Error & { code?: string };
  }
}

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
});

describe("market_data is owned by market_data_owner, trading by trading_owner", () => {
  let marketData: pg.Client;
  let trading: pg.Client;

  beforeAll(async () => {
    marketData = await as(urls.marketDataOwner);
    trading = await as(urls.tradingOwner);
    await marketData.query(
      `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until)
       VALUES ('BTC-USD', now(), 61000, 'test', now() + interval '10 minutes'),
              ('AAPL', now() - interval '3 days', 190, 'test', now() - interval '1 day')
       ON CONFLICT DO NOTHING`,
    );
  });

  it("denies trading_owner a SELECT from a market_data table", async () => {
    const error = await failure(trading, "SELECT * FROM market_data.quotes");
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/permission denied/);
  });

  it("lets trading_owner SELECT from market_data.prices_v1, with the stale flag", async () => {
    const { rows } = await trading.query("SELECT symbol, price::float AS price, source, stale FROM market_data.prices_v1 ORDER BY symbol");
    expect(rows).toEqual([
      { symbol: "AAPL", price: 190, source: "test", stale: true },
      { symbol: "BTC-USD", price: 61000, source: "test", stale: false },
    ]);
  });

  it("denies trading_owner any write through the price contract", async () => {
    for (const sql of ["INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ('X', now(), 1, 't', now())", "DELETE FROM market_data.quotes", "CREATE TABLE market_data.sneaky (id int)"]) {
      expect((await failure(trading, sql))?.code, sql).toBe("42501");
    }
  });

  it("denies market_data_owner every read and write on trading", async () => {
    for (const sql of ["SELECT * FROM trading.accounts", "SELECT * FROM trading.orders", "SELECT * FROM trading.ledger", "INSERT INTO trading.accounts (handle, buying_power) VALUES ('x', 1)", "DELETE FROM trading.positions", "CREATE TABLE trading.sneaky (id int)"]) {
      const error = await failure(marketData, sql);
      expect(error?.code, sql).toBe("42501");
      expect(error?.message, sql).toMatch(/permission denied for schema trading/);
    }
  });

  it("does not let PUBLIC use either schema: a role with no grant sees neither", async () => {
    const migrator = await as(urls.migrator);
    await migrator.query("DROP ROLE IF EXISTS outsider");
    await migrator.query("CREATE ROLE outsider NOLOGIN");
    await migrator.query("GRANT outsider TO migrator WITH SET TRUE");
    for (const sql of ["SELECT 1 FROM market_data.prices_v1", "SELECT 1 FROM trading.accounts"]) {
      await migrator.query("SET ROLE outsider");
      const error = await failure(migrator, sql);
      await migrator.query("RESET ROLE");
      expect(error?.code, sql).toBe("42501");
    }
    await migrator.query("DROP ROLE outsider");
  });

  it("runs each migration folder as its own owner, so a migration that reaches the other schema fails in the database", async () => {
    const migrator = await as(urls.migrator);
    await migrator.query("BEGIN");
    await migrator.query("SET LOCAL ROLE trading_owner");
    const error = await failure(migrator, "CREATE TABLE market_data.trading_wrote_this (id int)");
    await migrator.query("ROLLBACK");
    expect(error?.code).toBe("42501");
  });

  it("owns every object in the schema by that schema's owner role", async () => {
    const { rows } = await marketData.query(
      `SELECT n.nspname AS schema, pg_get_userbyid(c.relowner) AS owner, c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('market_data', 'trading') AND c.relkind IN ('r', 'v')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.owner, `${row.schema}.${row.relname}`).toBe(row.schema === "market_data" ? "market_data_owner" : "trading_owner");
  });
});

describe("the roles hold only what they should", () => {
  it("revoked neon_superuser from both runtime roles, and no runtime role is a superuser", async () => {
    const migrator = await as(urls.migrator);
    const { rows } = await migrator.query(
      `SELECT r.rolname, r.rolsuper, r.rolbypassrls,
              pg_has_role(r.rolname, 'neon_superuser', 'MEMBER') AS neon_superuser,
              pg_has_role(r.rolname, 'pg_read_all_data', 'MEMBER') AS reads_all
         FROM pg_roles r WHERE r.rolname IN ('market_data_owner', 'trading_owner') ORDER BY 1`,
    );
    expect(rows).toEqual([
      { rolname: "market_data_owner", rolsuper: false, rolbypassrls: false, neon_superuser: false, reads_all: false },
      { rolname: "trading_owner", rolsuper: false, rolbypassrls: false, neon_superuser: false, reads_all: false },
    ]);
  });

  it("refuses to migrate if a runtime role can read every schema", async () => {
    const migrator = await as(urls.migrator);
    await migrator.query("GRANT neon_superuser TO trading_owner");
    try {
      await expect(migrateTrading(migrator, "trading_owner")).rejects.toThrow(/can read or write every schema/);
    } finally {
      await migrator.query("REVOKE neon_superuser FROM trading_owner");
    }
  });

  it("is idempotent: applying the migrations again changes nothing and fails nothing", async () => {
    const migrator = await as(urls.migrator);
    expect(await migrateMarketData(migrator, "market_data_owner")).toEqual(["0001_schema.sql", "0002_quotes_and_price_contract.sql"]);
    expect(await migrateTrading(migrator, "trading_owner")).toEqual(["0001_schema.sql", "0002_accounts_orders_ledger.sql"]);
  });
});
