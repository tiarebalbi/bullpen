export interface GlobalQuote {
  symbol: string;
  /** A decimal string exactly as the provider sent it. */
  price: string;
  /** The provider's "latest trading day", YYYY-MM-DD. */
  latestTradingDay: string;
}

export class ProviderError extends Error {
  constructor(
    readonly kind: "http" | "limit" | "shape",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const ENDPOINT = "https://www.alphavantage.co/query";

export function globalQuoteUrl(symbol: string, apiKey: string): string {
  return `${ENDPOINT}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

const isDecimal = (value: unknown): value is string => typeof value === "string" && /^\d+(\.\d+)?$/.test(value);
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The provider's own message when it refuses to answer, or undefined. */
function refusalOf(record: Record<string, unknown>): string | undefined {
  const message = record["Note"] ?? record["Information"] ?? record["Error Message"];
  return typeof message === "string" ? message : undefined;
}

/**
 * Reads a GLOBAL_QUOTE response. The provider answers 200 even when it
 * refuses (a rate-limit message instead of data), so the body is checked, not
 * just the status. A refusal is a "limit" error and is never treated as a price.
 */
export function parseGlobalQuote(symbol: string, body: unknown): GlobalQuote {
  const record = asRecord(body);
  const refusal = refusalOf(record);
  if (refusal !== undefined) throw new ProviderError("limit", `${symbol}: the provider refused: ${refusal.slice(0, 160)}`);

  const fields = asRecord(record["Global Quote"]);
  const price = fields["05. price"];
  const day = fields["07. latest trading day"];
  if (fields["01. symbol"] !== symbol || !isDecimal(price) || !isDate(day)) {
    throw new ProviderError("shape", `${symbol}: the response has no usable Global Quote`);
  }
  return { symbol, price, latestTradingDay: day };
}

/** One GLOBAL_QUOTE request. The caller has already reserved the call. */
export async function fetchGlobalQuote(symbol: string, apiKey: string, fetchFn: FetchLike): Promise<GlobalQuote> {
  const response = await fetchFn(globalQuoteUrl(symbol, apiKey));
  if (!response.ok) throw new ProviderError("http", `${symbol}: the provider answered ${response.status}`);
  return parseGlobalQuote(symbol, await response.json());
}
