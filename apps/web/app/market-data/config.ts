/** The market-data module's configuration. Only this directory reads these variables. */
export interface MarketDataConfig {
  /** The secret Vercel sends a cron job as `Authorization: Bearer <secret>`. */
  cronSecret: string | undefined;
  /** The stock data provider's API key. */
  providerKey: string | undefined;
}

export function marketDataConfig(env: Record<string, string | undefined> = process.env): MarketDataConfig {
  return { cronSecret: env.CRON_SECRET, providerKey: env.ALPHA_VANTAGE_API_KEY };
}
