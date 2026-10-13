// Applies the roles setup and every owner's migrations to a real database, as the admin role.
//
//   DATABASE_URL_MIGRATOR=<unpooled admin URL> pnpm --filter @bullpen/fitness-checks db:migrate
//
// The URL comes from your environment and is never printed. Run it after creating the two owner
// roles in the provider's console. It is safe to run again: every file is idempotent.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate as migrateMarketData } from "@bullpen/db-market-data";
import { migrate as migrateTrading } from "@bullpen/db-trading";

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error("db-migrate: set DATABASE_URL_MIGRATOR to the unpooled admin connection string.");
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const pkg of ["db-market-data", "db-trading"]) {
    await client.query(readFileSync(join(repoRoot, "packages", pkg, "roles.sql"), "utf8"));
    console.log(`roles.sql applied for ${pkg}`);
  }
  console.log("market_data:", (await migrateMarketData(client, "market_data_owner")).join(", "));
  console.log("trading:", (await migrateTrading(client, "trading_owner")).join(", "));

  const roles = await client.query(
    `SELECT r.rolname, r.rolsuper, r.rolbypassrls, COALESCE((SELECT pg_has_role(r.rolname, g.oid, 'MEMBER') FROM pg_roles g WHERE g.rolname = 'neon_superuser'), false) AS neon_superuser
       FROM pg_roles r WHERE r.rolname IN ('market_data_owner', 'trading_owner') ORDER BY 1`,
  );
  console.table(roles.rows);
  console.log("SHOW max_connections:", (await client.query("SHOW max_connections")).rows[0]?.max_connections);
} finally {
  await client.end();
}
