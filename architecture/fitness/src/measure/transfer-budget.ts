/**
 * A measurement run moves bytes through Neon, and the Free plan gives 5 GB a month and suspends the compute when it is gone (it was,
 * on 2026-10-16). So a run estimates what it will move before it starts, prints that, and refuses to start if it would pass a share
 * of what is left. The estimate is an input to a decision, not a result: the run reports what it measured next to it.
 */
import { LEADERBOARD_TOP } from "@bullpen/db-trading";

/** What one row of the leaderboard read costs on the wire: measured on 2,096 accounts as 172 B of JSON, rounded up. */
export const BYTES_PER_ROW = 175;
/** The rest of a read: the as-of query, the statement and result framing, the response header. */
export const BYTES_PER_READ_OVERHEAD = 250;
/** TLS and the Postgres wire protocol on top of the payload. */
export const WIRE_FACTOR = 1.1;
/** One buy is a transaction of about eight statements and their results. */
export const BYTES_PER_WRITE = 2500;
/** A buy takes about 0.6 s from a laptop: so a writer does about this many a second. */
export const WRITES_PER_SECOND_PER_WRITER = 1.7;

export interface CellPlan {
  label: string;
  readers: number;
  seconds: number;
  writers: number;
  /** How often one reader reads: measured at 12 a second for 20 rows, so 10 is a reasoned figure for 51. Configurable. */
  readsPerSecondPerReader: number;
  rowsPerRead: number;
}

export interface CellEstimate {
  label: string;
  bytesPerRead: number;
  bytes: number;
}

export interface RunEstimate {
  bytesPerRead: number;
  cells: CellEstimate[];
  setup: number;
  total: number;
}

export const bytesPerRead = (rowsPerRead: number): number => Math.round((rowsPerRead * BYTES_PER_ROW + BYTES_PER_READ_OVERHEAD) * WIRE_FACTOR);

export function estimateCell(cell: CellPlan): CellEstimate {
  const perRead = bytesPerRead(cell.rowsPerRead);
  const reads = cell.readers * cell.readsPerSecondPerReader * cell.seconds;
  const writes = cell.writers * WRITES_PER_SECOND_PER_WRITER * cell.seconds;
  return { label: cell.label, bytesPerRead: perRead, bytes: Math.round(reads * perRead + writes * BYTES_PER_WRITE * WIRE_FACTOR) };
}

/** Seeding sends the account ids back once to give each its positions (36 bytes an id), plus the statements. */
export const setupBytes = (accounts: number): number => Math.round(accounts * 45 * WIRE_FACTOR + 8_000);

export function estimateRun(cells: CellPlan[], accounts: number): RunEstimate {
  const estimates = cells.map(estimateCell);
  const setup = setupBytes(accounts);
  return { bytesPerRead: bytesPerRead(LEADERBOARD_TOP + 1), cells: estimates, setup, total: setup + estimates.reduce((sum, c) => sum + c.bytes, 0) };
}

export interface BudgetDecision {
  ok: boolean;
  message: string;
}

/** Whether a run may start: its estimated bytes against `maxShare` of what remains. An unknown remainder refuses. */
export function checkTransferBudget(estimateBytes: number, remainingBytes: number | undefined, maxShare: number): BudgetDecision {
  const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;
  if (remainingBytes === undefined || !Number.isFinite(remainingBytes) || remainingBytes <= 0) {
    return { ok: false, message: `Refusing to run: the remaining network transfer is not given (or is zero). Read it from the Neon dashboard and pass --remaining-mb. This run is estimated at ${mb(estimateBytes)}.` };
  }
  const limit = remainingBytes * maxShare;
  if (estimateBytes > limit) {
    return { ok: false, message: `Refusing to run: estimated ${mb(estimateBytes)} is more than ${(maxShare * 100).toFixed(0)}% (${mb(limit)}) of the ${mb(remainingBytes)} remaining this month.` };
  }
  return { ok: true, message: `Within budget: estimated ${mb(estimateBytes)}, ${(maxShare * 100).toFixed(0)}% of the ${mb(remainingBytes)} remaining is ${mb(limit)}.` };
}
