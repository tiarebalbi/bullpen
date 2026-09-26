import { NextResponse } from "next/server";
import { validateCoinGeckoPrice, validatePriceSnapshot, type PriceSnapshot } from "@bullpen/contracts";

/**
 * How long Bullpen's own cache holds an upstream CoinGecko response before
 * calling again. Read by architecture/fitness's budget check (via a plain
 * regex over this file, matching the pattern of the other real, fs-based
 * fitness checks) to model monthly upstream call volume against the Demo
 * plan's allowance in cost/allowances.json -- lowering this value without
 * raising the allowance is what makes that check fail. See ADR-0005.
 */
export const REVALIDATE_SECONDS = 300;

// Route segment intentionally left dynamic (no `export const revalidate`
// here): that Next.js route-segment config statically prerenders the GET
// handler at build time, which would call CoinGecko during `next build` --
// including in CI, where that's forbidden. Caching instead happens purely
// on the upstream `fetch()` call below via Next's Data Cache, which still
// caps upstream calls to once per REVALIDATE_SECONDS without ever touching
// the network during a build.
export const dynamic = "force-dynamic";

const SUPPORTED_SYMBOLS: Record<string, string> = {
  "BTC-USD": "bitcoin",
};

const UPSTREAM_BASE = "https://api.coingecko.com/api/v3/simple/price";

/**
 * The landing app's own "Live prices" strip (apps/landing's
 * MarketStripSection) fetches this route client-side, cross-origin --
 * needs CORS. `Access-Control-Allow-Origin` can only ever be one exact
 * origin per response (never a real wildcard once we care which origins
 * are allowed), so this validates the request's actual `Origin` header
 * against an allow-list -- production, plus a pattern matching landing's
 * Vercel preview URLs -- and echoes back that same origin, never a
 * literal "*". A request from anywhere else gets no CORS header at all,
 * which the browser treats as blocked.
 */
const PRODUCTION_LANDING_ORIGIN = process.env.BULLPEN_LANDING_ORIGIN ?? "https://bullpen-landing.vercel.app";

// Landing's custom production domain, alongside its .vercel.app alias --
// both serve production, so both are exact-match allowed origins.
const CUSTOM_LANDING_ORIGIN = process.env.BULLPEN_LANDING_CUSTOM_ORIGIN ?? "https://bullpen.tiarebalbi.com";

// Matches both of Vercel's preview URL shapes for this project: the
// git-branch alias (bullpen-landing-git-<branch>-<team>.vercel.app) and
// the per-deployment hash alias (bullpen-landing-<hash>-<team>.vercel.app).
const PREVIEW_LANDING_ORIGIN_PATTERN = /^https:\/\/bullpen-landing-[a-z0-9-]+-tiare-balbis-projects\.vercel\.app$/;

function resolveAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === PRODUCTION_LANDING_ORIGIN) return origin;
  if (origin === CUSTOM_LANDING_ORIGIN) return origin;
  if (PREVIEW_LANDING_ORIGIN_PATTERN.test(origin)) return origin;
  return null;
}

function withCors(response: NextResponse, allowedOrigin: string | null): NextResponse {
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function jsonError(
  message: string,
  status: number,
  allowedOrigin: string | null,
  retryAfterSeconds?: number,
): NextResponse {
  const headers = new Headers();
  if (retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return withCors(NextResponse.json({ error: message }, { status, headers }), allowedOrigin);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const allowedOrigin = resolveAllowedOrigin(request);
  const { symbol } = await params;
  const coinId = SUPPORTED_SYMBOLS[symbol];

  if (!coinId) {
    return jsonError("Unknown symbol.", 404, allowedOrigin);
  }

  const apiKey = process.env.COINGECKO_DEMO_API_KEY;
  if (!apiKey) {
    return jsonError("Price service is not configured.", 500, allowedOrigin);
  }

  const upstreamUrl = `${UPSTREAM_BASE}?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true&include_24hr_change=true`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: { "x-cg-demo-api-key": apiKey },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    return jsonError("Market data provider is unavailable.", 503, allowedOrigin, 30);
  }

  if (upstreamResponse.status === 429 || upstreamResponse.status >= 500) {
    return jsonError("Market data provider is unavailable.", 503, allowedOrigin, 30);
  }
  if (!upstreamResponse.ok) {
    return jsonError("Upstream error.", 502, allowedOrigin);
  }

  let upstreamPayload: unknown;
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch {
    return jsonError("Malformed upstream response.", 502, allowedOrigin);
  }

  const upstreamValidation = validateCoinGeckoPrice(upstreamPayload);
  if (!upstreamValidation.valid) {
    return jsonError("Malformed upstream response.", 502, allowedOrigin);
  }

  const coin = (
    upstreamPayload as Record<string, { usd: number; usd_24h_change: number; last_updated_at: number }>
  )[coinId];
  if (!coin) {
    return jsonError("Malformed upstream response.", 502, allowedOrigin);
  }

  const snapshot: PriceSnapshot = {
    symbol,
    price: coin.usd,
    changePercent: coin.usd_24h_change,
    time: new Date(coin.last_updated_at * 1000).toISOString(),
    source: "coingecko",
    fetchedAt: new Date().toISOString(),
  };

  const snapshotValidation = validatePriceSnapshot(snapshot);
  if (!snapshotValidation.valid) {
    return jsonError("Internal error building response.", 502, allowedOrigin);
  }

  return withCors(
    NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": `s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
      },
    }),
    allowedOrigin,
  );
}
