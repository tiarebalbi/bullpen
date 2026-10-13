import { NextResponse } from "next/server";
import { marketDataConfig } from "../../../market-data/config.js";
import { marketDataPool } from "../../../market-data/db/pool.js";
import { isAuthorized, runStockIngest } from "../../../market-data/ingest.js";
import { STOCK_SYMBOLS } from "../../../market-data/symbols.js";

export const dynamic = "force-dynamic";
// Ten symbols, twelve seconds apart: about two minutes, inside Hobby's 300-second limit.
export const maxDuration = 300;

/** `?symbols=AAPL,MSFT` runs a subset by hand, so a validation spends one or two calls, not ten. Anything that is not a known symbol is refused. */
function requestedSymbols(request: Request): readonly string[] | Response {
  const raw = new URL(request.url).searchParams.get("symbols");
  if (raw === null) return STOCK_SYMBOLS;
  const wanted = raw.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const unknown = wanted.filter((symbol) => !(STOCK_SYMBOLS as readonly string[]).includes(symbol));
  return unknown.length > 0 || wanted.length === 0 ? NextResponse.json({ error: `Unknown symbols: ${unknown.join(", ") || "none given"}` }, { status: 400 }) : wanted;
}

/**
 * The end-of-day ingest. The cron calls it once a day after the close, and it can be
 * called by hand with the same secret. It does nothing without `Authorization: Bearer
 * <CRON_SECRET>`.
 */
export async function GET(request: Request): Promise<Response> {
  const config = marketDataConfig();
  if (!isAuthorized(request, config.cronSecret)) return new Response("Unauthorized", { status: 401 });
  if (!config.providerKey) return NextResponse.json({ error: "The stock data provider key is not configured." }, { status: 500 });

  const symbols = requestedSymbols(request);
  if (symbols instanceof Response) return symbols;

  const log = {
    warn: (message: string, fields: Record<string, unknown>) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
    info: (message: string, fields: Record<string, unknown>) => console.info(JSON.stringify({ level: "info", message, ...fields })),
  };
  const summary = await runStockIngest({
    pool: marketDataPool(),
    apiKey: config.providerKey,
    now: new Date(),
    fetchFn: (url) => fetch(url),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
    symbols,
  });
  return NextResponse.json(summary);
}
