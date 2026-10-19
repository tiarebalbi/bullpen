// Creates market_data_owner and trading_owner as plain roles, with random passwords.
//
//   DATABASE_URL_MIGRATOR=<unpooled admin URL> pnpm --filter @bullpen/fitness-checks db:create-roles -- --out ~/Downloads/owner-roles.env
//
// The passwords are written only to the --out file (mode 600), as the two runtime URLs
// (DATABASE_URL_MARKET_DATA, DATABASE_URL_TRADING, through the pooled host), and are never printed.
// Roles that already exist are left alone. Afterwards run `db:migrate`.
import { chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import pg from "pg";
import { createOwnerRoles, type OwnerRole } from "../src/db-integration/create-roles.ts";

const url = process.env.DATABASE_URL_MIGRATOR;
const outIndex = process.argv.indexOf("--out");
const out = outIndex === -1 ? undefined : process.argv[outIndex + 1]?.replace(/^~(?=\/)/, homedir());
if (!url || !out) {
  console.error("db-create-roles: set DATABASE_URL_MIGRATOR and pass --out <file>.");
  process.exit(1);
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();
try {
  const created = await createOwnerRoles(admin);
  const names = Object.keys(created) as OwnerRole[];
  if (names.length === 0) {
    console.log("both roles already exist; nothing written");
  } else {
    const parsed = new URL(url);
    const pooledHost = parsed.hostname.includes("-pooler") ? parsed.hostname : parsed.hostname.replace(/^([^.]+)/, "$1-pooler");
    const variable: Record<OwnerRole, string> = { market_data_owner: "DATABASE_URL_MARKET_DATA", trading_owner: "DATABASE_URL_TRADING" };
    const lines = names.map((role) => `${variable[role]}=postgresql://${role}:${created[role]}@${pooledHost}${parsed.pathname}?sslmode=require`);
    writeFileSync(out, `${lines.join("\n")}\n`, { mode: 0o600 });
    chmodSync(out, 0o600);
    console.log(`created ${names.join(", ")}; wrote ${names.map((role) => variable[role]).join(", ")} to ${out}`);
  }
} finally {
  await admin.end();
}
