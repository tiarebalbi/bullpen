import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createOwnerRoles } from "./create-roles.js";
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
 * Does what the repo says to do, as a role like Neon's admin (CREATEROLE, not
 * a superuser): create the two owner roles as plain roles, run each package's
 * roles.sql, then the migrations. Passwords are random and die with the run.
 */
export default async function setup({ provide }: { provide: (key: "dbUrls", value: DbUrls) => void }): Promise<() => Promise<void>> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Run `pnpm --filter @bullpen/fitness-checks test:db`, which starts a Postgres container, or point it at a throwaway Postgres.");
  }
  const base = new URL(adminUrl);
  const passwords = { migrator: randomBytes(12).toString("hex") };

  const superuser = await connect(adminUrl);
  await superuser.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  for (const role of ["migrator", "market_data_owner", "trading_owner", "neon_superuser"]) await superuser.query(`DROP ROLE IF EXISTS ${role}`);
  // A superuser-like role, as some consoles have: used to prove the guard refuses a runtime role that joins it.
  await superuser.query("CREATE ROLE neon_superuser NOLOGIN");
  await superuser.query("GRANT pg_read_all_data, pg_write_all_data TO neon_superuser");
  // The admin role, like Neon's: CREATEROLE but not a superuser. It creates the owner roles itself.
  await superuser.query(`CREATE ROLE migrator LOGIN CREATEROLE CREATEDB PASSWORD '${passwords.migrator}'`);
  await superuser.query("GRANT neon_superuser TO migrator WITH ADMIN OPTION");
  await superuser.query(`CREATE DATABASE ${DATABASE} OWNER migrator`);
  await superuser.end();

  const migratorUrl = url(base, "migrator", passwords.migrator);
  const migrator = await connect(migratorUrl);
  const created = await createOwnerRoles(migrator);
  for (const pkg of ["db-market-data", "db-trading"]) await migrator.query(readFileSync(join(repoRoot, "packages", pkg, "roles.sql"), "utf8"));
  await migrateMarketData(migrator, "market_data_owner");
  await migrateTrading(migrator, "trading_owner");
  await migrator.end();

  const urls: DbUrls = {
    migrator: migratorUrl,
    marketDataOwner: url(base, "market_data_owner", created.market_data_owner!),
    tradingOwner: url(base, "trading_owner", created.trading_owner!),
  };

  provide("dbUrls", urls);
  return async () => {
    const cleanup = await connect(adminUrl);
    await cleanup.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of ["migrator", "market_data_owner", "trading_owner", "neon_superuser"]) await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
    await cleanup.end();
  };
}
