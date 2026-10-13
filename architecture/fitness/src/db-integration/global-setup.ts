import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate as migrateMarketData } from "@bullpen/db-market-data";
import { migrate as migrateTrading } from "@bullpen/db-trading";

export interface DbUrls {
  /** The migrator: a member of both owner roles, never a superuser. */
  migrator: string;
  marketDataOwner: string;
  tradingOwner: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrls: DbUrls;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const DATABASE = "bullpen_test";

const url = (base: URL, user: string, password: string): string => {
  const next = new URL(base.toString());
  next.username = user;
  next.password = password;
  next.pathname = `/${DATABASE}`;
  return next.toString();
};

async function connect(connectionString: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Creates what the provider's console creates (the two owner roles with
 * generated passwords, and, as some consoles do, membership in
 * neon_superuser), then does what the repo says to do: run each package's
 * roles.sql as the admin role, then the migrations. Passwords are random and
 * die with the run.
 */
export default async function setup({ provide }: { provide: (key: "dbUrls", value: DbUrls) => void }): Promise<() => Promise<void>> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Run `pnpm --filter @bullpen/fitness-checks test:db`, which starts a Postgres container, or point it at a throwaway Postgres.");
  }
  const base = new URL(adminUrl);
  const passwords = { market_data_owner: randomBytes(12).toString("hex"), trading_owner: randomBytes(12).toString("hex"), migrator: randomBytes(12).toString("hex") };

  const superuser = await connect(adminUrl);
  await superuser.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  for (const role of ["migrator", "market_data_owner", "trading_owner", "neon_superuser"]) await superuser.query(`DROP ROLE IF EXISTS ${role}`);
  await superuser.query("CREATE ROLE neon_superuser NOLOGIN");
  await superuser.query("GRANT pg_read_all_data, pg_write_all_data TO neon_superuser");
  for (const role of ["market_data_owner", "trading_owner"] as const) await superuser.query(`CREATE ROLE ${role} LOGIN PASSWORD '${passwords[role]}'`);
  await superuser.query(`CREATE ROLE migrator LOGIN CREATEROLE CREATEDB PASSWORD '${passwords.migrator}'`);
  await superuser.query("GRANT market_data_owner, trading_owner TO migrator WITH ADMIN OPTION");
  await superuser.query("GRANT neon_superuser TO migrator WITH ADMIN OPTION");
  // The console does this as the admin role: new roles join neon_superuser, granted by it. The admin role can then revoke it.
  // Assumption, to verify on the provider's first run.
  await superuser.query("SET ROLE migrator");
  await superuser.query("GRANT neon_superuser TO market_data_owner, trading_owner");
  await superuser.query("RESET ROLE");
  await superuser.query(`CREATE DATABASE ${DATABASE} OWNER migrator`);
  await superuser.end();

  const urls: DbUrls = {
    migrator: url(base, "migrator", passwords.migrator),
    marketDataOwner: url(base, "market_data_owner", passwords.market_data_owner),
    tradingOwner: url(base, "trading_owner", passwords.trading_owner),
  };

  const migrator = await connect(urls.migrator);
  for (const pkg of ["db-market-data", "db-trading"]) await migrator.query(readFileSync(join(repoRoot, "packages", pkg, "roles.sql"), "utf8"));
  await migrateMarketData(migrator, "market_data_owner");
  await migrateTrading(migrator, "trading_owner");
  await migrator.end();

  provide("dbUrls", urls);
  return async () => {
    const cleanup = await connect(adminUrl);
    await cleanup.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of ["migrator", "market_data_owner", "trading_owner", "neon_superuser"]) await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
    await cleanup.end();
  };
}
