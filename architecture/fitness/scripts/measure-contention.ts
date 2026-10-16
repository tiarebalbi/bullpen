// Measures what a leaderboard read costs a ledger write, on the shared Neon database, for two read paths:
// the ranking computed on read from the source tables, and the materialized view.
//
//   DATABASE_URL_TRADING=<url> DATABASE_URL_MARKET_DATA=<url> pnpm --filter @bullpen/fitness-checks db:measure-contention \
//     [-- --accounts 2000 --seconds 15 --writers 4]
//
// Everything it writes is marked as test data (account handles start "zz-test-", quotes have source "test") and is
// removed by `db:cleanup-test-data`. It prints a markdown table and never a URL.
import { performance } from "node:perf_hooks";
import pg from "pg";
import { computeLeaderboardOnRead, createPool, placeMarketBuy, readLeaderboardRows, refreshLeaderboard } from "@bullpen/db-trading";

const arg = (name: string, fallback: number): number => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const ACCOUNTS = arg("accounts", 2000);
const SECONDS = arg("seconds", 15);
const WRITERS = arg("writers", 4);
const READER_COUNTS = [0, 10, 50];
const SYMBOLS = ["ZZTA", "ZZTB", "ZZTC", "ZZTD", "ZZTE"];
const HANDLE = "zz-test-contention-";

const tradingUrl = process.env.DATABASE_URL_TRADING;
const marketDataUrl = process.env.DATABASE_URL_MARKET_DATA;
if (!tradingUrl || !marketDataUrl) {
  console.error("measure-contention: set DATABASE_URL_TRADING and DATABASE_URL_MARKET_DATA.");
  process.exit(1);
}

const pool = createPool(tradingUrl, 70);
const percentile = (sorted: number[], p: number): number => (sorted.length === 0 ? Number.NaN : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!);
const summary = (ms: number[]) => {
  const sorted = [...ms].sort((a, b) => a - b);
  return { n: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
};
const fmt = (x: number): string => (Number.isNaN(x) ? "n/a" : `${x.toFixed(0)} ms`);

async function seed(): Promise<string[]> {
  const market = new pg.Client({ connectionString: marketDataUrl });
  await market.connect();
  for (const symbol of SYMBOLS) {
    await market.query(
      "INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() - interval '1 minute', 10, 'test', now() + interval '2 hours') ON CONFLICT DO NOTHING",
      [symbol],
    );
  }
  await market.end();
  const { rows } = await pool.query<{ account_id: string }>(
    "INSERT INTO trading.accounts (handle, buying_power) SELECT $1 || g, 1000000 FROM generate_series(1, $2) g ON CONFLICT (handle) DO NOTHING RETURNING account_id",
    [HANDLE, ACCOUNTS],
  );
  const ids = rows.map((r) => r.account_id);
  await pool.query("INSERT INTO trading.positions (account_id, symbol, quantity) SELECT a, s, 3 FROM unnest($1::uuid[]) a, unnest($2::text[]) s ON CONFLICT DO NOTHING", [ids, SYMBOLS]);
  await refreshLeaderboard(pool);
  return ids;
}

interface Cell { writes: number[]; reads: number[]; refreshes: number[] }

/** Runs WRITERS buying loops and `readers` reading loops for SECONDS; optionally refreshes the view throughout. */
async function run(ids: string[], readers: number, read: () => Promise<unknown>, withRefresh: boolean): Promise<Cell> {
  const cell: Cell = { writes: [], reads: [], refreshes: [] };
  const stopAt = Date.now() + SECONDS * 1000;
  const loop = (work: () => Promise<void>) => (async () => { while (Date.now() < stopAt) await work(); })();
  const writer = () => loop(async () => {
    const accountId = ids[Math.floor(Math.random() * ids.length)]!;
    const t = performance.now();
    await placeMarketBuy(pool, { accountId, symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!, quantity: "1" });
    cell.writes.push(performance.now() - t);
  });
  const reader = () => loop(async () => {
    const t = performance.now();
    await read();
    cell.reads.push(performance.now() - t);
  });
  const refresher = () => loop(async () => {
    const t = performance.now();
    await refreshLeaderboard(pool);
    cell.refreshes.push(performance.now() - t);
  });
  await Promise.all([
    ...Array.from({ length: WRITERS }, writer),
    ...Array.from({ length: readers }, reader),
    ...(withRefresh ? [refresher()] : []),
  ]);
  return cell;
}

const ids = await seed();
const [{ n: ledgerBefore }] = (await pool.query<{ n: string }>("SELECT count(*) AS n FROM trading.ledger")).rows as [{ n: string }];
console.log(`batch: ${ids.length} accounts, ${ids.length * SYMBOLS.length} positions, ${ledgerBefore} ledger rows before; ${WRITERS} writers; ${SECONDS} s per cell\n`);

const paths: [string, () => Promise<unknown>][] = [
  ["computed on read", () => computeLeaderboardOnRead(pool)],
  ["materialized view", () => readLeaderboardRows(pool)],
];
console.log("| N readers | Read path | Ledger write p50 / p95 | Leaderboard read p95 | Writes | Reads |");
console.log("|---|---|---|---|---|---|");
for (const readers of READER_COUNTS) {
  for (const [name, read] of paths) {
    if (readers === 0 && name === "materialized view") continue; // N = 0 has no readers: one baseline row
    const cell = await run(ids, readers, read, false);
    const w = summary(cell.writes);
    const r = summary(cell.reads);
    console.log(`| ${readers} | ${readers === 0 ? "none (baseline)" : name} | ${fmt(w.p50)} / ${fmt(w.p95)} | ${readers === 0 ? "n/a" : fmt(r.p95)} | ${w.n} | ${r.n} |`);
  }
}

const during = await run(ids, 0, async () => undefined, true);
const idle = await run(ids, 0, async () => undefined, false);
const refresh = summary(during.refreshes);
console.log(`\nRefresh (CONCURRENTLY), ${ids.length} accounts: ${refresh.n} refreshes, duration p50 ${fmt(refresh.p50)}, p95 ${fmt(refresh.p95)}`);
console.log(`Ledger write p95 with no refresh running: ${fmt(summary(idle.writes).p95)}; during back-to-back refreshes: ${fmt(summary(during.writes).p95)}`);
await pool.end();
