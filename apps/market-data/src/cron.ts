import type { MarketDataConfig } from "./config/index.js";
import { isAuthorized, type IngestDeps, type IngestSummary } from "./ingest.js";
import { STOCK_SYMBOLS } from "./symbols.js";

export interface CronDeps {
  config: Pick<MarketDataConfig, "cronSecret" | "stockProviderKey">;
  /** Builds the ingest's dependencies for the symbols to run; the handler only decides whether and what. */
  runIngest: (symbols: readonly string[], apiKey: string) => Promise<IngestSummary>;
}

/** `?symbols=AAPL,MSFT` runs a subset by hand, so a validation spends one or two calls, not ten. Anything that is not a known symbol is refused. */
function requestedSymbols(request: Request): readonly string[] | Response {
  const raw = new URL(request.url).searchParams.get("symbols");
  if (raw === null) return STOCK_SYMBOLS;
  const wanted = raw.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const unknown = wanted.filter((symbol) => !(STOCK_SYMBOLS as readonly string[]).includes(symbol));
  return unknown.length > 0 || wanted.length === 0 ? Response.json({ error: `Unknown symbols: ${unknown.join(", ") || "none given"}` }, { status: 400 }) : wanted;
}

/**
 * GET /api/cron/ingest. The cron calls it once a day after the close, and it can be
 * called by hand with the same secret. It does nothing without `Authorization: Bearer
 * <CRON_SECRET>`.
 */
export async function handleIngestRequest(request: Request, deps: CronDeps): Promise<Response> {
  if (!isAuthorized(request, deps.config.cronSecret)) return new Response("Unauthorized", { status: 401 });
  if (!deps.config.stockProviderKey) return Response.json({ error: "The stock data provider key is not configured." }, { status: 500 });

  const symbols = requestedSymbols(request);
  if (symbols instanceof Response) return symbols;
  return Response.json(await deps.runIngest(symbols, deps.config.stockProviderKey));
}

export type { IngestDeps };
