/** The Market Data service's configuration. Only this directory reads these variables. */
export interface MarketDataConfig {
  /** The secret Vercel sends a cron job as `Authorization: Bearer <secret>`. */
  cronSecret: string | undefined;
  /** The stock data provider's API key. */
  stockProviderKey: string | undefined;
  /** The crypto data provider's API key (CoinGecko Demo). */
  cryptoProviderKey: string | undefined;
  /** Where the landing app is served, for the price route's CORS allow-list. */
  landingOrigins: { production: string; custom: string };
  vercelEnv: string | undefined;
}

export function marketDataConfig(env: Record<string, string | undefined> = process.env): MarketDataConfig {
  return {
    cronSecret: env.CRON_SECRET,
    stockProviderKey: env.ALPHA_VANTAGE_API_KEY,
    cryptoProviderKey: env.COINGECKO_DEMO_API_KEY,
    landingOrigins: {
      production: env.BULLPEN_LANDING_ORIGIN ?? "https://bullpen-landing.vercel.app",
      custom: env.BULLPEN_LANDING_CUSTOM_ORIGIN ?? "https://bullpen.tiarebalbi.com",
    },
    vercelEnv: env.VERCEL_ENV,
  };
}
