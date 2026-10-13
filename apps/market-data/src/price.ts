import { validateCoinGeckoPrice, validatePriceSnapshot, type PriceSnapshot } from "@bullpen/contracts";

/**
 * How long Bullpen's own cache holds an upstream CoinGecko response before
 * calling again. Read by architecture/fitness's budget check (via a plain
 * regex over this file) to model monthly upstream call volume against the Demo
 * plan's allowance in cost/allowances.json: lowering this value without raising
 * the allowance is what makes that check fail. See ADR-0005.
 */
export const REVALIDATE_SECONDS = 300;

const SUPPORTED_SYMBOLS: Record<string, string> = {
  "BTC-USD": "bitcoin",
};

const UPSTREAM_BASE = "https://api.coingecko.com/api/v3/simple/price";

// Matches both of Vercel's preview URL shapes for the landing project: the git-branch alias
// (bullpen-landing-git-<branch>-<team>.vercel.app) and the per-deployment hash alias.
const PREVIEW_LANDING_ORIGIN_PATTERN = /^https:\/\/bullpen-landing-[a-z0-9-]+-tiare-balbis-projects\.vercel\.app$/;

export interface PriceDeps {
  apiKey: string | undefined;
  fetchFn: (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
  now: () => Date;
  landingOrigins: { production: string; custom: string };
  /** Reserves one CoinGecko call against the budget, or throws. Called only when a call is about to go out. */
  reserveCall: () => Promise<unknown>;
}

/**
 * The landing app's "Live prices" strip fetches this route client-side,
 * cross-origin, so it needs CORS. `Access-Control-Allow-Origin` is one exact
 * origin per response, never a wildcard: the request's `Origin` is checked
 * against an allow-list (production, landing's custom domain, and a pattern
 * for landing's Vercel previews) and echoed back. Anything else gets no CORS
 * header, which the browser treats as blocked.
 */
function allowedOriginOf(request: Request, origins: PriceDeps["landingOrigins"]): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === origins.production || origin === origins.custom || PREVIEW_LANDING_ORIGIN_PATTERN.test(origin)) return origin;
  return null;
}

function respond(body: unknown, init: { status?: number; headers?: Record<string, string> }, allowedOrigin: string | null): Response {
  const headers = new Headers(init.headers);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
  }
  return Response.json(body, { status: init.status ?? 200, headers });
}

const failure = (message: string, status: number, origin: string | null, retryAfterSeconds?: number): Response =>
  respond({ error: message }, { status, headers: retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) } }, origin);

/** Bullpen's own price shape from CoinGecko's payload, or a failure response. */
function snapshotFrom(symbol: string, coinId: string, payload: unknown, now: Date, origin: string | null): PriceSnapshot | Response {
  if (!validateCoinGeckoPrice(payload).valid) return failure("Malformed upstream response.", 502, origin);
  const coin = (payload as Record<string, { usd: number; usd_24h_change: number; last_updated_at: number }>)[coinId];
  if (!coin) return failure("Malformed upstream response.", 502, origin);
  const snapshot: PriceSnapshot = {
    symbol,
    price: coin.usd,
    changePercent: coin.usd_24h_change,
    time: new Date(coin.last_updated_at * 1000).toISOString(),
    source: "coingecko",
    fetchedAt: now.toISOString(),
  };
  return validatePriceSnapshot(snapshot).valid ? snapshot : failure("Internal error building response.", 502, origin);
}

/** GET /api/price/<symbol>: one symbol's price, in Bullpen's own shape and never the raw upstream payload. */
export async function handlePrice(request: Request, symbol: string, deps: PriceDeps): Promise<Response> {
  const origin = allowedOriginOf(request, deps.landingOrigins);
  const coinId = SUPPORTED_SYMBOLS[symbol];
  if (!coinId) return failure("Unknown symbol.", 404, origin);
  if (!deps.apiKey) return failure("Price service is not configured.", 500, origin);

  try {
    await deps.reserveCall();
  } catch {
    return failure("Market data provider is unavailable.", 503, origin, REVALIDATE_SECONDS);
  }

  let upstream: Response;
  try {
    upstream = await deps.fetchFn(`${UPSTREAM_BASE}?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true&include_24hr_change=true`, { headers: { "x-cg-demo-api-key": deps.apiKey } });
  } catch {
    return failure("Market data provider is unavailable.", 503, origin, 30);
  }
  if (upstream.status === 429 || upstream.status >= 500) return failure("Market data provider is unavailable.", 503, origin, 30);
  if (!upstream.ok) return failure("Upstream error.", 502, origin);

  const payload: unknown = await upstream.json().catch(() => undefined);
  const snapshot = snapshotFrom(symbol, coinId, payload, deps.now(), origin);
  if (snapshot instanceof Response) return snapshot;
  return respond(snapshot, { headers: { "Cache-Control": `s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}` } }, origin);
}
