// Measures what a leaderboard read costs a ledger write, on the shared Neon database, for two read paths. See src/measure/contention.ts.
//
//   DATABASE_URL_TRADING=<url> DATABASE_URL_MARKET_DATA=<url> pnpm --filter @bullpen/fitness-checks db:measure-contention -- \
//     --remaining-mb <what the Neon dashboard says is left this month> [--accounts 200] [--seconds 15] [--writers 8] [--max-share 0.1]
//
// `--estimate-only` prints the estimate and exits without touching the database (it needs no URLs). Before any run it prints the estimated
// bytes per read, per cell and for the whole run, and refuses if the run would pass --max-share of --remaining-mb. After the run it prints
// what it measured next to each estimate. It never prints a URL.
import { runContention } from "../src/measure/contention.js";
import { checkTransferBudget, estimateRun, type CellPlan } from "../src/measure/transfer-budget.js";
import { LEADERBOARD_TOP } from "@bullpen/db-trading";

const arg = (name: string, fallback?: number): number | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const accounts = arg("accounts", 200)!;
const seconds = arg("seconds", 15)!;
const writers = arg("writers", 8)!;
const readsPerSecondPerReader = arg("reads-per-second-per-reader", 10)!;
const maxShare = arg("max-share", 0.1)!;
const remainingMb = arg("remaining-mb");
const readerCounts = [0, 10, 50];

const plan: CellPlan[] = readerCounts.flatMap((readers) =>
  (readers === 0 ? ["baseline"] : ["computed on read", "materialized view"]).map((path) => ({ label: `${readers} readers, ${path}`, readers, seconds, writers, readsPerSecondPerReader, rowsPerRead: LEADERBOARD_TOP + 1 })),
);
// The two cells that follow: writers alone, once with the view refreshing back to back and once without.
for (const label of ["refresh phase, with refreshes", "refresh phase, without"]) plan.push({ label, readers: 0, seconds, writers, readsPerSecondPerReader, rowsPerRead: LEADERBOARD_TOP + 1 });
const estimate = estimateRun(plan, accounts);
const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

console.log(`estimate: ${accounts} accounts, ${seconds} s cells, ${writers} writers, ${readsPerSecondPerReader} reads a second per reader, ${LEADERBOARD_TOP + 1} rows a read`);
console.log(`  per read: ${(estimate.bytesPerRead / 1000).toFixed(1)} KB`);
for (const cell of estimate.cells) console.log(`  ${cell.label.padEnd(34)} ${mb(cell.bytes)}`);
console.log(`  setup ${mb(estimate.setup)}; whole run ${mb(estimate.total)}`);

const decision = checkTransferBudget(estimate.total, remainingMb === undefined ? undefined : remainingMb * 1e6, maxShare);
console.log(decision.message);
if (process.argv.includes("--estimate-only")) process.exit(0);
if (!decision.ok) process.exit(1);

const tradingUrl = process.env.DATABASE_URL_TRADING;
const marketDataUrl = process.env.DATABASE_URL_MARKET_DATA;
if (!tradingUrl || !marketDataUrl) {
  console.error("measure-contention: set DATABASE_URL_TRADING and DATABASE_URL_MARKET_DATA.");
  process.exit(1);
}

const report = await runContention({ tradingUrl, marketDataUrl, accounts, seconds, writers, readerCounts, readsPerSecondPerReader, log: (line) => console.log(line) });
const ms = (x: number): string => (Number.isNaN(x) ? "n/a" : `${x.toFixed(0)} ms`);
console.log(`\nbatch: ${report.accounts} accounts, ${report.positions} positions; ${writers} writers; ${seconds} s per cell; reads are the top ${LEADERBOARD_TOP} and the caller's row\n`);
console.log("| N readers | Read path | Ledger write p50 / p95 | Leaderboard read p95 | Bytes per read | Bytes per cell, measured (estimated) |");
console.log("|---|---|---|---|---|---|");
for (const cell of report.cells) {
  console.log(`| ${cell.readers} | ${cell.path} | ${ms(cell.writes.p50)} / ${ms(cell.writes.p95)} | ${cell.reads.n ? ms(cell.reads.p95) : "n/a"} | ${cell.bytesPerRead === null ? "n/a" : `${(cell.bytesPerRead / 1000).toFixed(1)} KB`} | ${mb(cell.measuredBytes)} (${mb(cell.estimated.bytes)}) |`);
}
console.log(`\nRefresh (CONCURRENTLY), ${report.accounts} accounts: ${report.refresh.n} refreshes, duration p50 ${ms(report.refresh.p50)}, p95 ${ms(report.refresh.p95)}`);
console.log(`Ledger write p95 with no refresh running: ${ms(report.refresh.writesIdle.p95)}; during back-to-back refreshes: ${ms(report.refresh.writesDuring.p95)}`);
console.log(`\nBytes moved: setup ${mb(report.setupBytes)}, whole run ${mb(report.totalBytes)} measured against ${mb(estimate.total)} estimated.`);
console.log(`Cleaned up: removed ${report.removed.accounts} accounts (with their orders, ledger entries and positions) and ${report.removed.quotes} quotes of run ${report.runId}.`);
