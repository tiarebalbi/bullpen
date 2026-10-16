// Measures what a leaderboard read costs a ledger write, on the shared Neon database, for two read paths:
// the ranking computed on read from the source tables, and the materialized view.
//
//   DATABASE_URL_TRADING=<url> DATABASE_URL_MARKET_DATA=<url> pnpm --filter @bullpen/fitness-checks db:measure-contention \
//     [-- --accounts 2000 --seconds 15 --writers 4]
//
// Everything it writes is marked as test data (account handles start "zz-test-", quotes have source "test") and is
// removed by `db:cleanup-test-data`. It prints a markdown table and never a URL.
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
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
  await pool.query("INSERT INTO trading.accounts (handle, buying_power) SELECT $1 || g, 1000000 FROM generate_series(1, $2) g ON CONFLICT (handle) DO NOTHING", [HANDLE, ACCOUNTS]);
  const { rows } = await pool.query<{ account_id: string }>("SELECT account_id FROM trading.accounts WHERE handle LIKE $1 || '%'", [HANDLE]);
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

const DIAGNOSE = process.argv.includes("--diagnose");

interface Diagnosis { waits: Map<string, number>; samples: number; activeMax: number; activeSum: number; poolWaitingMax: number; poolTotalMax: number; execMs: number[]; planMs: number[] }

/** While a cell runs: what the sessions of this role wait on, how many are active, whether our own pool queues, and what the server says a leaderboard read costs it. */
async function watch(stopAt: number, pool: pg.Pool): Promise<Diagnosis> {
  const client = new pg.Client({ connectionString: tradingUrl });
  await client.connect();
  const d: Diagnosis = { waits: new Map(), samples: 0, activeMax: 0, activeSum: 0, poolWaitingMax: 0, poolTotalMax: 0, execMs: [], planMs: [] };
  let tick = 0;
  while (Date.now() < stopAt) {
    const { rows } = await client.query<{ state: string | null; wait_event_type: string | null; wait_event: string | null; n: string }>(
      "SELECT state, wait_event_type, wait_event, count(*) AS n FROM pg_stat_activity WHERE usename = current_user AND pid <> pg_backend_pid() GROUP BY 1, 2, 3",
    );
    let active = 0;
    for (const r of rows) {
      const key = `${r.state ?? "none"} | ${r.wait_event_type ?? "CPU or running"} | ${r.wait_event ?? "-"}`;
      d.waits.set(key, (d.waits.get(key) ?? 0) + Number(r.n));
      if (r.state === "active") active += Number(r.n);
    }
    d.samples += 1;
    d.activeSum += active;
    d.activeMax = Math.max(d.activeMax, active);
    d.poolWaitingMax = Math.max(d.poolWaitingMax, pool.waitingCount);
    d.poolTotalMax = Math.max(d.poolTotalMax, pool.totalCount);
    if (tick++ % 4 === 0) {
      const plan = (await client.query<{ "QUERY PLAN": { "Execution Time": number; "Planning Time": number }[] }>("EXPLAIN (ANALYZE, FORMAT JSON) SELECT account_id, handle, cash, positions_value, equity, rank FROM trading.leaderboard_mv ORDER BY rank, handle")).rows[0]!["QUERY PLAN"][0]!;
      d.execMs.push(plan["Execution Time"]);
      d.planMs.push(plan["Planning Time"]);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await client.end();
  return d;
}

function printDiagnosis(title: string, cell: Cell, d: Diagnosis, loop: { p50: number; p95: number; max: number }, rowsPerRead: number): void {
  const w = summary(cell.writes);
  const r = summary(cell.reads);
  const ex = summary(d.execMs);
  console.log(`\n### ${title}`);
  console.log(`client: ledger write p50 / p95 ${fmt(w.p50)} / ${fmt(w.p95)} (${w.n}); leaderboard read p95 ${r.n ? fmt(r.p95) : "n/a"} (${r.n})`);
  console.log(`server: leaderboard read executes in p50 ${ex.p50.toFixed(2)} ms / p95 ${ex.p95.toFixed(2)} ms (EXPLAIN ANALYZE, ${ex.n} samples); planning p50 ${summary(d.planMs).p50.toFixed(2)} ms`);
  console.log(`this machine: Node event-loop delay p50 ${loop.p50.toFixed(1)} ms / p95 ${loop.p95.toFixed(1)} ms / max ${loop.max.toFixed(1)} ms; ${rowsPerRead} rows per read, ${(r.n * rowsPerRead / SECONDS).toFixed(0)} rows a second received`);
  console.log(`sessions of this role, ${d.samples} samples: active avg ${(d.activeSum / d.samples).toFixed(1)}, max ${d.activeMax}; our pool: max ${d.poolTotalMax} connections, max ${d.poolWaitingMax} callers waiting for one`);
  console.log("what those sessions were in (sample counts):");
  for (const [key, n] of [...d.waits.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${key}`);
}

const ids = await seed();
const [{ n: ledgerBefore }] = (await pool.query<{ n: string }>("SELECT count(*) AS n FROM trading.ledger")).rows as [{ n: string }];
console.log(`batch: ${ids.length} accounts, ${ids.length * SYMBOLS.length} positions, ${ledgerBefore} ledger rows before; ${WRITERS} writers; ${SECONDS} s per cell\n`);

if (DIAGNOSE) {
  const top20 = () => pool.query("SELECT account_id, handle, cash::text, positions_value::text, equity::text, rank FROM trading.leaderboard_mv ORDER BY rank, handle LIMIT 20");
  const cells: [string, number, () => Promise<unknown>, number][] = [
    ["0 readers", 0, () => readLeaderboardRows(pool), 0],
    ["50 readers, the whole ranking (2,000 rows a read)", 50, () => readLeaderboardRows(pool), ids.length],
    ["50 readers, the top 20 rows a read", 50, top20, 20],
  ];
  for (const [title, readers, read, rowsPerRead] of cells) {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const stopAt = Date.now() + SECONDS * 1000 + 1000;
    const [cell, d] = await Promise.all([run(ids, readers, read, false), watch(stopAt, pool)]);
    histogram.disable();
    printDiagnosis(`${title}, ${WRITERS} writers, ${SECONDS} s`, cell, d, { p50: histogram.percentile(50) / 1e6, p95: histogram.percentile(95) / 1e6, max: histogram.max / 1e6 }, rowsPerRead);
  }
  await pool.end();
  process.exit(0);
}

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
