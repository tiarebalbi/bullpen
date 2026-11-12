/**
 * Builds the local stack a load run needs: its own database with the real roles and migrations, a crowd of player accounts and a set of end-of-day prices.
 * Local only: it refuses any admin URL that is not on this machine, because a load run must never touch a deployed database.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres tsx src/load/stack.ts <out.json> [players] [symbols]
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import type { DbUrls } from "../db-integration/global-setup.js";

export interface Stack {
  urls: DbUrls;
  accounts: string[];
  symbols: string[];
  database: string;
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocal(connectionString: string): void {
  const host = new URL(connectionString).hostname;
  if (!LOCAL.has(host)) throw new Error(`refusing to run a load against ${host}: only this machine's own database is allowed`);
}

/**
 * Gives every load player `perPlayer` filled orders in the past, with their reservations, fills, ledger entries and positions, so a run meets the tables as they are after
 * weeks of play and not empty ones. Set-based, and consistent with Part 4's invariants (cash adds up to the starting cash), which the runs check at the end.
 */
async function seedHistory(trading: pg.Pool, symbols: string[], perPlayer: number): Promise<void> {
  await trading.query(
    `WITH g AS (
       SELECT a.account_id, s.i, ($1::text[])[1 + (s.i % $2::int)] AS symbol, (1 + s.i % 7)::numeric AS qty, (50 + (s.i % $2::int) * 10)::numeric AS price
         FROM trading.accounts a CROSS JOIN generate_series(1, $3::int) s(i) WHERE a.handle LIKE 'zz-load-%'),
     o AS (
       INSERT INTO trading.orders (account_id, symbol, side, quantity, status, filled_qty, open_qty, cancelled_qty, cap_price, client_order_id, created_at, updated_at)
       SELECT account_id, symbol, 'buy', qty, 'filled', qty, 0, 0, round(price * 1.05, 8), 'hist-' || i, now() - make_interval(hours => i), now() - make_interval(hours => i)
         FROM g RETURNING order_id, account_id, symbol, quantity, cap_price, client_order_id, created_at),
     r AS (
       INSERT INTO trading.reservations (order_id, account_id, reserved, spent, released, released_at)
       SELECT o.order_id, o.account_id, o.quantity * o.cap_price, o.quantity * (o.cap_price / 1.05), o.quantity * o.cap_price - o.quantity * (o.cap_price / 1.05), o.created_at FROM o RETURNING 1),
     f AS (
       INSERT INTO trading.fills (fill_id, order_id, account_id, symbol, quantity, price, executed_at)
       SELECT o.order_id::text || ':0', o.order_id, o.account_id, o.symbol, o.quantity, o.cap_price / 1.05, o.created_at FROM o RETURNING fill_id, order_id, account_id, symbol, quantity, price),
     l AS (
       INSERT INTO trading.ledger (order_id, account_id, asset, delta, fill_id)
       SELECT order_id, account_id, 'USD', -(quantity * price), fill_id FROM f UNION ALL SELECT order_id, account_id, symbol, quantity, fill_id FROM f RETURNING 1)
     INSERT INTO trading.positions (account_id, symbol, quantity) SELECT account_id, symbol, sum(quantity) FROM f GROUP BY account_id, symbol`,
    [symbols, symbols.length, perPlayer],
  );
  await trading.query(
    `UPDATE trading.accounts a SET buying_power = 1000000 + COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = a.account_id AND l.asset = 'USD'), 0) WHERE a.handle LIKE 'zz-load-%'`,
  );
  await trading.query("ANALYZE");
}

export async function buildStack(adminUrl: string, players: number, symbolCount: number, historyPerPlayer = 0): Promise<Stack> {
  assertLocal(adminUrl);
  process.env.TEST_DATABASE_URL = adminUrl;
  process.env.TEST_DATABASE_NAME ??= "bullpen_load";
  // Imported now, not at the top: the setup reads TEST_DATABASE_NAME when it loads.
  const { default: setup } = await import("../db-integration/global-setup.js");
  // Databases of earlier runs depend on the same cluster-wide roles, which the setup recreates: clear them first. This cluster is a throwaway one (assertLocal above).
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  for (const name of ["bullpen_test", "bullpen_load", "bullpen_multixact"]) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  let urls: DbUrls | undefined;
  await setup({ provide: (_key, value) => (urls = value) });
  if (!urls) throw new Error("setup provided no URLs");

  const trading = new pg.Pool({ connectionString: urls.tradingOwner, max: 4 });
  const market = new pg.Pool({ connectionString: urls.marketDataOwner, max: 2 });
  const symbols = Array.from({ length: symbolCount }, (_, i) => `LD${String(i).padStart(2, "0")}`);
  for (const [i, symbol] of symbols.entries()) {
    await market.query(
      `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until, kind)
       VALUES ($1, now() - interval '20 hours', $2, 'load', now() + interval '48 hours', 'end-of-day')`,
      [symbol, String(50 + i * 10)],
    );
  }
  const accounts: string[] = [];
  for (let i = 0; i < players; i += 1) {
    const { rows } = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, $2) RETURNING account_id", [`zz-load-${i}`, "1000000"]);
    accounts.push(rows[0]!.account_id);
  }
  if (historyPerPlayer > 0) await seedHistory(trading, symbols, historyPerPlayer);
  await trading.end();
  await market.end();
  return { urls, accounts, symbols, database: process.env.TEST_DATABASE_NAME };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, players = "1000", symbols = "8", history = "0"] = process.argv.slice(2);
  if (!out || !process.env.TEST_DATABASE_URL) {
    console.error("usage: TEST_DATABASE_URL=<local admin url> tsx src/load/stack.ts <out.json> [players] [symbols]");
    process.exit(1);
  }
  const stack = await buildStack(process.env.TEST_DATABASE_URL, Number(players), Number(symbols), Number(history));
  writeFileSync(out, JSON.stringify(stack));
  console.log(`stack ready: ${stack.accounts.length} players, ${stack.symbols.length} symbols, database ${stack.database}`);
}
