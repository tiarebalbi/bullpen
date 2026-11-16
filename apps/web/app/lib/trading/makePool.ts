import { attachDatabasePool } from "@vercel/functions";
import { createPool } from "@bullpen/db-trading";

export interface PoolSpec {
  /** Shown in pg_stat_activity. */
  name: string;
  max: number;
  /** How long a request waits for a free connection before it is refused. */
  waitMs: number;
}

/** True for a Neon pooled host (`-pooler` in the first label) or a machine's own address; anything else is a direct connection, which costs a Postgres connection per client. */
export function isPoolerHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0]!.endsWith("-pooler") || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

let warned = false;

/**
 * One module-scope pool for one kind of work (ADR-0030). Fluid compute reuses an instance for many requests, so a pool created once per module serves them all;
 * `attachDatabasePool` closes its idle connections before the instance is suspended. The URL is the existing trading one: a pooled host in transaction mode
 * (a direct host would work but spend a Postgres connection per client, so it is said once in the log).
 */
export function makeTradingPool(spec: PoolSpec): ReturnType<typeof createPool> {
  const url = process.env.DATABASE_URL_TRADING;
  if (!url) throw new Error("DATABASE_URL_TRADING is not set");
  if (!warned && !isPoolerHost(url)) {
    warned = true;
    console.warn(JSON.stringify({ at: "trading.pool", message: "DATABASE_URL_TRADING is not a pooled host; every client holds a Postgres connection" }));
  }
  const pool = createPool(url, { max: spec.max, applicationName: spec.name, connectionTimeoutMillis: spec.waitMs, idleTimeoutMillis: 5_000 });
  attachDatabasePool(pool);
  return pool;
}
