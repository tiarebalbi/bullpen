import type { Pool } from "pg";

/** Every table and view the migrations make, which the app reads or writes. */
export const EXPECTED_RELATIONS = ["accounts", "orders", "ledger", "positions", "reservations", "fills", "order_events", "leaderboard_mv", "leaderboard_refresh"] as const;

/** Columns added after a table was first made: the ones a database missing a later migration lacks. */
export const EXPECTED_COLUMNS: readonly (readonly [table: string, column: string])[] = [["accounts", "owner_user_id"]];

/**
 * What the trading schema is missing, as names (`trading.accounts.owner_user_id`), so a migration that was never run on a database shows up
 * by name instead of as a failed query. Empty when the schema is complete. Throws when the database cannot be reached at all.
 */
export async function checkSchema(pool: Pool): Promise<string[]> {
  const relations = await pool.query<{ relname: string }>(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'trading' AND c.relname = ANY($1)",
    [[...EXPECTED_RELATIONS]],
  );
  const present = new Set(relations.rows.map((row) => row.relname));
  const missing = EXPECTED_RELATIONS.filter((name) => !present.has(name)).map((name) => `trading.${name}`);

  const columns = await pool.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'trading' AND table_name = ANY($1)",
    [[...new Set(EXPECTED_COLUMNS.map(([table]) => table))]],
  );
  const have = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const [table, column] of EXPECTED_COLUMNS) if (present.has(table) && !have.has(`${table}.${column}`)) missing.push(`trading.${table}.${column}`);

  // The trading side reads prices only through this view (ADR-0012); a missing view and a missing grant fail the same way.
  try {
    await pool.query("SELECT 1 FROM market_data.prices_v1 LIMIT 1");
  } catch {
    missing.push("market_data.prices_v1");
  }
  return missing;
}
