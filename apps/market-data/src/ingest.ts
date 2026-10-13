import type { Pool } from "pg";
import { hasQuote, storeQuote } from "@bullpen/db-market-data";
import { fetchGlobalQuote, type FetchLike } from "./alphavantage.js";
import { BudgetExceeded, reserveCall, type Logger, type Reserve } from "./budget.js";
import { closeOfNewYorkDay, isTradingDay, newYorkDate, stockValidUntil } from "./calendar.js";
import { STOCK_SYMBOLS } from "./symbols.js";

/** About 12 seconds between calls: the free key reportedly allows 5 a minute (secondary sources, unconfirmed). */
export const CALL_SPACING_MS = 12_000;

export interface IngestDeps {
  pool: Pool;
  apiKey: string;
  now: Date;
  fetchFn: FetchLike;
  sleep: (ms: number) => Promise<void>;
  log: Logger & { info: (message: string, fields: Record<string, unknown>) => void };
  symbols?: readonly string[];
  spacingMs?: number;
  /** `VERCEL_ENV`: decides which cap and ledger row the calls count against. */
  vercelEnv?: string;
  /** Test seams: what the ingest stores into, asks, and reserves with. They default to the real ones. */
  seams?: { has?: typeof hasQuote; store?: typeof storeQuote; reserve?: Reserve };
}

export interface IngestSummary {
  /** The New York date this run priced. */
  date: string;
  skipped: "not-a-trading-day" | null;
  stored: string[];
  /** Symbols whose quote for this day was already stored: no call was spent. */
  alreadyHad: string[];
  /** The provider's latest trading day was not this day yet: nothing stored. */
  notYetPublished: string[];
  failed: Array<{ symbol: string; reason: string }>;
  /** The budget refused a call: the rest were not attempted. */
  refused: boolean;
}

/**
 * The end-of-day ingest. It prices the New York date it runs on, once per
 * symbol: a weekend or a market holiday is skipped without a call; a symbol it
 * already holds for the day is skipped without a call (cron delivery can repeat
 * a run); every call is reserved against the budget before it leaves, and spaced
 * so the provider's per-minute limit holds. A price is stored only if the
 * provider's latest trading day is the day being priced.
 */
export async function runStockIngest(deps: IngestDeps): Promise<IngestSummary> {
  const { pool, apiKey, now, fetchFn, sleep, log, symbols = STOCK_SYMBOLS, spacingMs = CALL_SPACING_MS, vercelEnv, seams = {} } = deps;
  const { has = hasQuote, store = storeQuote, reserve } = seams;
  const date = newYorkDate(now);
  const summary: IngestSummary = { date, skipped: null, stored: [], alreadyHad: [], notYetPublished: [], failed: [], refused: false };
  if (!isTradingDay(date)) return { ...summary, skipped: "not-a-trading-day" };

  const asOf = closeOfNewYorkDay(date);
  let called = false;
  for (const symbol of symbols) {
    if (await has(pool, symbol, asOf)) {
      summary.alreadyHad.push(symbol);
      continue;
    }
    try {
      await reserveCall(pool, "alphavantage", now, { log, reserve, vercelEnv });
    } catch (error) {
      if (!(error instanceof BudgetExceeded)) throw error;
      summary.refused = true;
      break;
    }
    if (called) await sleep(spacingMs);
    called = true;
    try {
      const quote = await fetchGlobalQuote(symbol, apiKey, fetchFn);
      if (quote.latestTradingDay !== date) {
        summary.notYetPublished.push(symbol);
        continue;
      }
      await store(pool, { symbol, price: quote.price, asOf, source: "alphavantage", validUntil: stockValidUntil(date) });
      summary.stored.push(symbol);
    } catch (error) {
      summary.failed.push({ symbol, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  log.info("stock ingest finished", { ...summary });
  return summary;
}

/** True when the request carries `Authorization: Bearer <secret>`, the header Vercel sends a cron job. A missing secret never authorizes. */
export function isAuthorized(request: Request, secret: string | undefined): boolean {
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
