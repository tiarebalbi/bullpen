import type { Pool } from "pg";
import { TEST_HANDLE_PREFIX } from "./testRows.js";

/** Advisory lock key for the leaderboard refresh. */
const REFRESH_LOCK = 7340601;
export const MAX_AGE_MS = 5 * 60 * 1000;
/** The most rows one read returns, apart from the caller's own row. */
export const LEADERBOARD_TOP = 50;

/**
 * The ranking, computed from the source tables. The materialized view in
 * migrations/0003_leaderboard.sql is the same query; the reconciliation check
 * fails the build if the two ever give different answers.
 */
export const LEADERBOARD_ON_READ_SQL = `
  SELECT a.account_id,
         a.handle,
         a.buying_power::numeric(20,8)                                           AS cash,
         COALESCE(SUM(p.quantity * pr.price), 0)::numeric(20,8)                  AS positions_value,
         (a.buying_power + COALESCE(SUM(p.quantity * pr.price), 0))::numeric(20,8) AS equity,
         RANK() OVER (ORDER BY a.buying_power + COALESCE(SUM(p.quantity * pr.price), 0) DESC)::integer AS rank
    FROM trading.accounts a
    LEFT JOIN trading.positions p ON p.account_id = a.account_id
    LEFT JOIN market_data.prices_v1 pr ON pr.symbol = p.symbol
   GROUP BY a.account_id, a.handle, a.buying_power`;

export interface LeaderboardRow {
  accountId: string;
  handle: string;
  cash: string;
  positionsValue: string;
  equity: string;
  rank: number;
}

export interface LeaderboardRead {
  /** The top of the ranking, at most LEADERBOARD_TOP rows, then the caller's own row if it is not among them. */
  rows: LeaderboardRow[];
  /** How many accounts are ranked, so a page can say "top 50 of 812". */
  total: number;
  /** When the ranking was computed: the last successful refresh. */
  asOf: Date;
  ageMs: number;
  /** Older than the refresh policy allows. */
  stale: boolean;
  /** The last refresh failed: the ranking is the last good one, and this says when and why. */
  lastFailure: { at: Date; error: string } | null;
}

interface RawRow {
  account_id: string;
  handle: string;
  cash: string;
  positions_value: string;
  equity: string;
  rank: number;
}

const toRow = (row: RawRow): LeaderboardRow => ({ accountId: row.account_id, handle: row.handle, cash: row.cash, positionsValue: row.positions_value, equity: row.equity, rank: row.rank });

/** Rows of a relation with the leaderboard's shape (the view, or a table a check wants to compare), ranked. */
export async function readLeaderboardRows(pool: Pool, relation = "trading.leaderboard_mv"): Promise<LeaderboardRow[]> {
  if (!/^[a-z_]+\.[a-z_]+$/.test(relation)) throw new Error(`not a schema-qualified relation: ${relation}`);
  const { rows } = await pool.query<RawRow>(`SELECT account_id, handle, cash::text, positions_value::text, equity::text, rank FROM ${relation} ORDER BY rank, handle`);
  return rows.map(toRow);
}

/** The ranking computed from the source tables now, ordered like the view. */
export async function computeLeaderboardOnRead(pool: Pool): Promise<LeaderboardRow[]> {
  const { rows } = await pool.query<RawRow>(`SELECT account_id, handle, cash::text, positions_value::text, equity::text, rank FROM (${LEADERBOARD_ON_READ_SQL}) l ORDER BY rank, handle`);
  return rows.map(toRow);
}

export interface ReadLeaderboardOptions {
  /** How many rows from the top. Default LEADERBOARD_TOP, and never more. */
  limit?: number;
  /** The caller's own account: its row is added when it is not among the top rows. */
  accountId?: string;
  /** Include accounts whose handle carries the test marker. A page never does. */
  includeTestRows?: boolean;
}

/**
 * Ranks the view's accounts, leaving out test-marked ones, and returns the top rows plus the caller's own. Ranks are computed
 * here over what is shown, so a hidden account never takes a place and tied accounts share a rank. The view is read whole on
 * the server (a few thousand rows is milliseconds) and only the cap crosses the wire.
 */
const READ_SQL = `
  WITH ranked AS (
    SELECT account_id, handle, cash, positions_value, equity,
           RANK() OVER (ORDER BY equity DESC)::integer AS rank,
           COUNT(*) OVER ()::integer AS total
      FROM trading.leaderboard_mv
     WHERE ($3::boolean OR handle NOT LIKE $4)
  )
  (SELECT account_id, handle, cash::text, positions_value::text, equity::text, rank, total FROM ranked ORDER BY rank, handle LIMIT $1)
  UNION
  (SELECT account_id, handle, cash::text, positions_value::text, equity::text, rank, total FROM ranked WHERE account_id = $2::uuid)
  ORDER BY rank, handle`;

/** The current ranking with its as-of time. It never recomputes and never waits for a refresh. */
export async function readLeaderboard(pool: Pool, now: Date = new Date(), maxAgeMs: number = MAX_AGE_MS, options: ReadLeaderboardOptions = {}): Promise<LeaderboardRead> {
  const limit = Math.max(1, Math.min(options.limit ?? LEADERBOARD_TOP, LEADERBOARD_TOP));
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const meta = await client.query<{ refreshed_at: Date; last_failed_at: Date | null; last_error: string | null }>("SELECT refreshed_at, last_failed_at, last_error FROM trading.leaderboard_refresh");
    const rows = await client.query<RawRow & { total: number }>(READ_SQL, [limit, options.accountId ?? null, options.includeTestRows ?? false, `${TEST_HANDLE_PREFIX}%`]);
    await client.query("COMMIT");
    const { refreshed_at: asOf, last_failed_at: failedAt, last_error: error } = meta.rows[0]!;
    const ageMs = Math.max(0, now.getTime() - asOf.getTime());
    const total = rows.rows[0]?.total ?? 0;
    return { rows: rows.rows.map(toRow), total, asOf, ageMs, stale: ageMs > maxAgeMs, lastFailure: failedAt ? { at: failedAt, error: error ?? "" } : null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type RefreshOutcome = "refreshed" | "skipped" | "failed";

/** Test seam: runs after the lock is taken and before the refresh, so a test can hold one refresh while another tries. */
export interface RefreshHooks {
  afterLock?: () => void | Promise<void>;
}

/**
 * Refreshes the view CONCURRENTLY, so readers are never blocked, under a
 * non-blocking advisory lock: if another refresh holds it, this one skips. The
 * lock is transaction-scoped and the refresh and the as-of time are one
 * transaction, so a failed refresh leaves the last good ranking and its time.
 */
export async function refreshLeaderboard(pool: Pool, hooks: RefreshHooks = {}): Promise<RefreshOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS locked", [REFRESH_LOCK]);
    if (!lock.rows[0]!.locked) {
      await client.query("ROLLBACK");
      return "skipped";
    }
    await hooks.afterLock?.();
    const started = Date.now();
    await client.query("REFRESH MATERIALIZED VIEW CONCURRENTLY trading.leaderboard_mv");
    await client.query("UPDATE trading.leaderboard_refresh SET refreshed_at = now(), duration_ms = $1, last_failed_at = NULL, last_error = NULL", [Date.now() - started]);
    await client.query("COMMIT");
    return "refreshed";
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : String(error);
    await pool.query("UPDATE trading.leaderboard_refresh SET last_failed_at = now(), last_error = $1", [message.slice(0, 500)]);
    return "failed";
  } finally {
    client.release();
  }
}

export interface ServeOptions {
  now?: Date;
  maxAgeMs?: number;
  /** Runs work after the response is sent (Next's `after`). */
  schedule: (work: () => Promise<unknown>) => void;
  /** What to read: the cap, the caller's own account, test rows. */
  read?: ReadLeaderboardOptions;
}

/**
 * The read path: return the current ranking now, with its as-of time; if it
 * is older than the policy allows, start a refresh after the response. No
 * reader waits for a refresh, and readers that all see a stale view start at
 * most one refresh between them.
 */
export async function serveLeaderboard(pool: Pool, { now = new Date(), maxAgeMs = MAX_AGE_MS, schedule, read: options }: ServeOptions): Promise<LeaderboardRead> {
  const read = await readLeaderboard(pool, now, maxAgeMs, options);
  if (read.stale) schedule(() => refreshLeaderboard(pool));
  return read;
}
