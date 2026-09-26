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

function jsonError(message: string, status: number, retryAfterSeconds?: number): NextResponse {
  const headers = new Headers();
  if (retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return NextResponse.json({ error: message }, { status, headers });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await params;
  const coinId = SUPPORTED_SYMBOLS[symbol];

  if (!coinId) {
    return jsonError("Unknown symbol.", 404);
  }

  const apiKey = process.env.COINGECKO_DEMO_API_KEY;
  if (!apiKey) {
    return jsonError("Price service is not configured.", 500);
  }

  const upstreamUrl = `${UPSTREAM_BASE}?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true&include_24hr_change=true`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: { "x-cg-demo-api-key": apiKey },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    return jsonError("Market data provider is unavailable.", 503, 30);
  }

  if (upstreamResponse.status === 429 || upstreamResponse.status >= 500) {
    return jsonError("Market data provider is unavailable.", 503, 30);
  }
  if (!upstreamResponse.ok) {
    return jsonError("Upstream error.", 502);
  }

  let upstreamPayload: unknown;
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch {
    return jsonError("Malformed upstream response.", 502);
  }

  const upstreamValidation = validateCoinGeckoPrice(upstreamPayload);
  if (!upstreamValidation.valid) {
    return jsonError("Malformed upstream response.", 502);
  }

  const coin = (
    upstreamPayload as Record<string, { usd: number; usd_24h_change: number; last_updated_at: number }>
  )[coinId];
  if (!coin) {
    return jsonError("Malformed upstream response.", 502);
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
    return jsonError("Internal error building response.", 502);
  }

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": `s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
    },
  });
}
