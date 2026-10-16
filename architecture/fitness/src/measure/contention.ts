/**
 * What a leaderboard read costs a ledger write, for two read paths, as a function of how many readers there are.
 *
 * It seeds once, runs every cell, and cleans up once. Everything it writes carries the test marker (a handle starting with
 * TEST_HANDLE_PREFIX and the run's own id, quotes with source TEST_QUOTE_SOURCE), and the cleanup removes exactly that run's rows. Each read
 * is the capped read: the top rows and the caller's own. It meters the bytes each connection moves, so a run reports what it
 * measured next to what it estimated.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE, computeLeaderboardOnRead, createPool, LEADERBOARD_TOP, placeMarketBuy, readLeaderboard, refreshLeaderboard } from "@bullpen/db-trading";
import { estimateCell, type CellEstimate, type CellPlan } from "./transfer-budget.js";

export interface ContentionOptions {
  tradingUrl: string;
  marketDataUrl: string;
  accounts: number;
  seconds: number;
  writers: number;
  readerCounts: number[];
  readsPerSecondPerReader: number;
  log: (line: string) => void;
}

export interface CellResult {
  readers: number;
  path: string;
  writes: Summary;
  reads: Summary;
  estimated: CellEstimate;
  measuredBytes: number;
  bytesPerRead: number | null;
}

export interface Summary {
  n: number;
  p50: number;
  p95: number;
}

export interface ContentionReport {
  runId: string;
  accounts: number;
  positions: number;
  cells: CellResult[];
  refresh: Summary & { writesDuring: Summary; writesIdle: Summary };
  setupBytes: number;
  totalBytes: number;
  removed: { accounts: number; quotes: number };
}

const SYMBOL_COUNT = 5;
const percentile = (sorted: number[], p: number): number => (sorted.length === 0 ? Number.NaN : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!);
const summarise = (ms: number[]): Summary => {
  const sorted = [...ms].sort((a, b) => a - b);
  return { n: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
};

/** Counts the bytes a connection's socket has read and written: what crosses the wire, encrypted. */
class Meter {
  private readonly sockets = new Set<{ bytesRead: number; bytesWritten: number }>();
  watch(pool: pg.Pool): void {
    pool.on("connect", (client) => this.add(client));
  }
  add(client: pg.Client | pg.PoolClient): void {
    const stream = (client as unknown as { connection?: { stream?: { bytesRead: number; bytesWritten: number } } }).connection?.stream;
    if (stream) this.sockets.add(stream);
  }
  total(): number {
    let sum = 0;
    for (const socket of this.sockets) sum += socket.bytesRead + socket.bytesWritten;
    return sum;
  }
}

export async function runContention(options: ContentionOptions): Promise<ContentionReport> {
  const { accounts, seconds, writers, readerCounts, readsPerSecondPerReader, log } = options;
  const runId = randomUUID().slice(0, 8);
  const handlePrefix = `${TEST_HANDLE_PREFIX}contention-${runId}-`;
  const symbols = Array.from({ length: SYMBOL_COUNT }, (_, i) => `ZZ${runId.slice(0, 4).toUpperCase()}${i}`);
  const pool = createPool(options.tradingUrl, writers + Math.max(...readerCounts, 0) + 8);
  const meter = new Meter();
  meter.watch(pool);
  const market = new pg.Client({ connectionString: options.marketDataUrl });
  await market.connect();
  meter.add(market);

  try {
    // Seed once.
    await market.query(
      `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until)
       SELECT s, now() - interval '1 minute', 10, $2, now() + interval '2 hours' FROM unnest($1::text[]) s`,
      [symbols, TEST_QUOTE_SOURCE],
    );
    await pool.query("INSERT INTO trading.accounts (handle, buying_power) SELECT $1 || g, 1000000 FROM generate_series(1, $2) g", [handlePrefix, accounts]);
    const { rows } = await pool.query<{ account_id: string }>("SELECT account_id FROM trading.accounts WHERE handle LIKE $1 || '%'", [handlePrefix]);
    const ids = rows.map((r) => r.account_id);
    await pool.query("INSERT INTO trading.positions (account_id, symbol, quantity) SELECT a, s, 3 FROM unnest($1::uuid[]) a, unnest($2::text[]) s", [ids, symbols]);
    await refreshLeaderboard(pool);
    const setupBytes = meter.total();
    log(`seeded ${ids.length} accounts x ${symbols.length} positions (run ${runId}), ${(setupBytes / 1e6).toFixed(2)} MB moved`);

    const callerId = (): string => ids[Math.floor(Math.random() * ids.length)]!;
    const capped = (path: "computed on read" | "materialized view") => (): Promise<unknown> =>
      path === "materialized view"
        ? readLeaderboard(pool, new Date(), undefined, { accountId: callerId(), includeTestRows: true })
        : computeLeaderboardOnRead(pool, { limit: LEADERBOARD_TOP, accountId: callerId() });

    interface Cell { writes: number[]; reads: number[]; refreshes: number[] }
    async function run(readers: number, read: () => Promise<unknown>, withRefresh: boolean): Promise<Cell> {
      const cell: Cell = { writes: [], reads: [], refreshes: [] };
      const stopAt = Date.now() + seconds * 1000;
      const loop = (work: () => Promise<void>) => (async () => { while (Date.now() < stopAt) await work(); })();
      await Promise.all([
        ...Array.from({ length: writers }, () => loop(async () => {
          const t = performance.now();
          await placeMarketBuy(pool, { accountId: ids[Math.floor(Math.random() * ids.length)]!, symbol: symbols[Math.floor(Math.random() * symbols.length)]!, quantity: "1" });
          cell.writes.push(performance.now() - t);
        })),
        ...Array.from({ length: readers }, () => loop(async () => {
          const t = performance.now();
          await read();
          cell.reads.push(performance.now() - t);
        })),
        ...(withRefresh ? [loop(async () => { const t = performance.now(); await refreshLeaderboard(pool); cell.refreshes.push(performance.now() - t); })] : []),
      ]);
      return cell;
    }

    const results: CellResult[] = [];
    for (const readers of readerCounts) {
      for (const path of ["computed on read", "materialized view"] as const) {
        if (readers === 0 && path === "materialized view") continue; // no readers: one baseline row
        const before = meter.total();
        const cell = await run(readers, capped(path), false);
        const measuredBytes = meter.total() - before;
        const plan: CellPlan = { label: `${readers} readers, ${path}`, readers, seconds, writers, readsPerSecondPerReader, rowsPerRead: LEADERBOARD_TOP + 1 };
        const reads = summarise(cell.reads);
        const writesSummary = summarise(cell.writes);
        results.push({ readers, path: readers === 0 ? "none (baseline)" : path, writes: writesSummary, reads, estimated: estimateCell(plan), measuredBytes, bytesPerRead: reads.n > 0 ? Math.round(measuredBytes / reads.n) : null });
        log(`cell done: ${readers} readers, ${path}: ${writesSummary.n} writes, ${reads.n} reads, ${(measuredBytes / 1e6).toFixed(1)} MB`);
      }
    }

    const during = await run(0, async () => undefined, true);
    const idle = await run(0, async () => undefined, false);
    const report: ContentionReport = {
      runId,
      accounts: ids.length,
      positions: ids.length * symbols.length,
      cells: results,
      refresh: { ...summarise(during.refreshes), writesDuring: summarise(during.writes), writesIdle: summarise(idle.writes) },
      setupBytes,
      totalBytes: 0,
      removed: { accounts: 0, quotes: 0 },
    };

    // Clean up once: only this run's rows, each owner with its own role.
    const removedAccounts = await removeRun(pool, handlePrefix);
    const removedQuotes = (await market.query("DELETE FROM market_data.quotes WHERE source = $1 AND symbol = ANY($2::text[])", [TEST_QUOTE_SOURCE, symbols])).rowCount ?? 0;
    await refreshLeaderboard(pool);
    report.removed = { accounts: removedAccounts, quotes: removedQuotes };
    report.totalBytes = meter.total();
    return report;
  } finally {
    await market.end();
    await pool.end();
  }
}

/** Deletes the run's accounts and everything that points at them, in dependency order, in one transaction. */
async function removeRun(pool: pg.Pool, handlePrefix: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = "SELECT account_id FROM trading.accounts WHERE handle LIKE $1 || '%'";
    await client.query(`DELETE FROM trading.ledger WHERE account_id IN (${owned})`, [handlePrefix]);
    await client.query(`DELETE FROM trading.orders WHERE account_id IN (${owned})`, [handlePrefix]);
    await client.query(`DELETE FROM trading.positions WHERE account_id IN (${owned})`, [handlePrefix]);
    const removed = (await client.query("DELETE FROM trading.accounts WHERE handle LIKE $1 || '%'", [handlePrefix])).rowCount ?? 0;
    await client.query("COMMIT");
    return removed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
