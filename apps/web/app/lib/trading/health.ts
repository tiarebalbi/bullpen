import { OWNER_ROLE, checkSchema } from "@bullpen/db-trading";
import { tradingPool } from "./pool.js";

/** The sweep secret is random and long; a short one is a typed word, not a generated value. */
const MIN_SWEEP_SECRET = 16;
const DATABASE_TIMEOUT_MS = 5_000;

type Env = Record<string, string | undefined>;

/**
 * What is wrong with the variables this directory owns, as sentences that name the variable and never print its value. Empty when both are
 * usable. Only this directory reads them (structure.adl), so the health route asks here instead of reading them itself.
 */
export function tradingConfigIssues(env: Env = process.env): string[] {
  const issues: string[] = [];
  const url = env.DATABASE_URL_TRADING;
  if (!url) issues.push("DATABASE_URL_TRADING is not set");
  else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") issues.push("DATABASE_URL_TRADING is not a postgres URL");
      else if (decodeURIComponent(parsed.username) !== OWNER_ROLE) issues.push(`DATABASE_URL_TRADING does not connect as ${OWNER_ROLE}`);
    } catch {
      issues.push("DATABASE_URL_TRADING is not a URL");
    }
  }
  const secret = env.SWEEP_SECRET;
  if (!secret) issues.push("SWEEP_SECRET is not set");
  else if (secret.length < MIN_SWEEP_SECRET) issues.push(`SWEEP_SECRET is shorter than ${MIN_SWEEP_SECRET} characters`);
  return issues;
}

const reason = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "error";
};

/**
 * Whether the trading database answers and has every table and column the app uses. A failure says which object is missing, or the error's
 * code (never its message, which can carry a host name). Reaching a database that is not configured is not tried.
 */
export async function tradingDatabaseIssues(pool: () => Parameters<typeof checkSchema>[0] = tradingPool): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), DATABASE_TIMEOUT_MS); });
    const missing = await Promise.race([checkSchema(pool()), timeout]);
    return missing.map((name) => `${name} is missing: run the migrations`);
  } catch (error) {
    return [`the trading database cannot be queried (${reason(error)})`];
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  problems: string[];
}

const entry = (name: string, problems: string[]): HealthCheck => ({ name, ok: problems.length === 0, problems });

/**
 * The trading side's two checks: its variables, then its database. A database whose URL is not usable is not tried, since the first check
 * already says what to fix.
 */
export async function tradingChecks(): Promise<HealthCheck[]> {
  const config = tradingConfigIssues();
  const urlUsable = !config.some((issue) => issue.startsWith("DATABASE_URL_TRADING"));
  return [entry("trading-config", config), entry("trading-database", urlUsable ? await tradingDatabaseIssues() : ["not tried: the database URL is not usable"])];
}
