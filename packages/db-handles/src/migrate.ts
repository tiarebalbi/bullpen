import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Applies this owner's migrations, in file order, each in its own
 * transaction. Every file is idempotent, so a re-run changes nothing. A file
 * marked `-- run-as: migrator` runs as the connected role (it creates the
 * schema); every other file runs as the owner role, so the owner owns what it
 * creates and a statement that reaches another owner's schema fails in the
 * database as well as in the check.
 */
export async function migrate(client: Client, ownerRole: string): Promise<string[]> {
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const asMigrator = /^-- run-as: migrator$/m.test(sql);
    await client.query("BEGIN");
    try {
      if (!asMigrator) await client.query(`SET LOCAL ROLE ${ownerRole}`);
      await client.query(sql);
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return applied;
}
