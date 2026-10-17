// Removes the test data a validation run wrote into the shared database, before Part 3 publishes.
//
//   DATABASE_URL_TRADING=<url> DATABASE_URL_MARKET_DATA=<url> pnpm --filter @bullpen/fitness-checks db:cleanup-test-data [-- --dry-run]
//
// Test data carries a marker: an account handle that starts with "zz-test-", or a quote whose source is "test".
// Real data is never touched: quotes from a provider and the call ledger stay. Each owner's data is removed with
// that owner's own role, so the cleanup respects the same boundaries as the code. It prints counts, never URLs.
import pg from "pg";
import { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE, refreshLeaderboard, createPool } from "@bullpen/db-trading";

const dryRun = process.argv.includes("--dry-run");
const tradingUrl = process.env.DATABASE_URL_TRADING;
const marketDataUrl = process.env.DATABASE_URL_MARKET_DATA;
if (!tradingUrl || !marketDataUrl) {
  console.error("db-cleanup-test-data: set DATABASE_URL_TRADING and DATABASE_URL_MARKET_DATA.");
  process.exit(1);
}

async function inTransaction(url: string, work: (client: pg.Client) => Promise<Record<string, number>>): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const counts = await work(client);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

const count = async (client: pg.Client, sql: string, params: unknown[]): Promise<number> => (await client.query(sql, params)).rowCount ?? 0;
const marked = `SELECT account_id FROM trading.accounts WHERE handle LIKE $1`;

const trading = await inTransaction(tradingUrl, async (client) => {
  const like = [`${TEST_HANDLE_PREFIX}%`];
  return {
    ledger: await count(client, `DELETE FROM trading.ledger WHERE account_id IN (${marked})`, like),
    orders: await count(client, `DELETE FROM trading.orders WHERE account_id IN (${marked})`, like),
    positions: await count(client, `DELETE FROM trading.positions WHERE account_id IN (${marked})`, like),
    accounts: await count(client, `DELETE FROM trading.accounts WHERE handle LIKE $1`, like),
  };
});
const market = await inTransaction(marketDataUrl, async (client) => ({
  quotes: await count(client, `DELETE FROM market_data.quotes WHERE source = $1`, [TEST_QUOTE_SOURCE]),
}));

console.log(`${dryRun ? "would remove" : "removed"} from trading:`, trading);
console.log(`${dryRun ? "would remove" : "removed"} from market_data:`, market);

if (!dryRun) {
  const pool = createPool(tradingUrl, 1);
  console.log("leaderboard refresh:", await refreshLeaderboard(pool));
  await pool.end();
}
