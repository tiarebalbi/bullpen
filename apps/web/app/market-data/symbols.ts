/**
 * The stocks Bullpen prices. Ten, one request each: 10 of the 20 calls the
 * budget allows in a provider-day, so a retry and a manual re-run still fit.
 */
export const STOCK_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "WMT"] as const;
