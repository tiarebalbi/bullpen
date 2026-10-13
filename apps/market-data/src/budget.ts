import type { Pool } from "pg";
import { reserveProviderCall, type CallReservation } from "@bullpen/db-market-data";

export type Provider = "alphavantage" | "coingecko";

interface Budget {
  cap: number;
  window: "provider-day" | "month";
}

/**
 * What each provider may be asked for. Alpha Vantage's free key allows 25
 * requests a day; the cap is 20, which leaves headroom for a retry and a
 * manual re-run. CoinGecko's Demo plan allows 10,000 calls a month; the cap is
 * 9,000, the 90% line ADR-0005's budget check models against.
 */
export const BUDGETS: Record<Provider, Budget> = {
  alphavantage: { cap: 20, window: "provider-day" },
  coingecko: { cap: 9000, window: "month" },
};

/**
 * The provider's own day. Not confirmed: the provider does not document when its
 * day resets, so this is the UTC date until a measurement says otherwise (see
 * architecture/reports/part-03).
 */
export function providerDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function windowKey(provider: Provider, now: Date): string {
  return BUDGETS[provider].window === "month" ? now.toISOString().slice(0, 7) : providerDay(now);
}

export interface Logger {
  warn: (message: string, fields: Record<string, unknown>) => void;
}

const consoleLogger: Logger = { warn: (message, fields) => console.warn(JSON.stringify({ level: "warn", message, ...fields })) };

export class BudgetExceeded extends Error {
  constructor(
    readonly provider: Provider,
    readonly window: string,
    readonly cap: number,
  ) {
    super(`${provider} call refused: ${cap} calls already made in ${window}.`);
    this.name = "BudgetExceeded";
  }
}

/** Reserves one call or throws `BudgetExceeded`, logging the refusal. Call it before every provider request. */
export async function reserveCall(
  pool: Pool,
  provider: Provider,
  now: Date,
  log: Logger = consoleLogger,
  reserve: (pool: Pool, provider: string, window: string, cap: number) => Promise<CallReservation> = reserveProviderCall,
): Promise<number> {
  const window = windowKey(provider, now);
  const { granted, calls, cap } = await reserve(pool, provider, window, BUDGETS[provider].cap);
  if (!granted) {
    log.warn("provider call refused before it left the process", { provider, window, calls, cap });
    throw new BudgetExceeded(provider, window, cap);
  }
  return calls;
}
