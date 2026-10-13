import { reserveCall } from "../../src/budget.js";
import { marketDataConfig } from "../../src/config/index.js";
import { marketDataPool } from "../../src/db/pool.js";
import { handlePrice } from "../../src/price.js";

/** GET /api/price/<symbol>: the public price route, served by the Market Data service behind a rewrite. */
export async function GET(request: Request): Promise<Response> {
  const config = marketDataConfig();
  const symbol = decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "");
  return handlePrice(request, symbol, {
    apiKey: config.cryptoProviderKey,
    fetchFn: (url, init) => fetch(url, init),
    now: () => new Date(),
    landingOrigins: config.landingOrigins,
    reserveCall: () => reserveCall(marketDataPool(), "coingecko", new Date(), { vercelEnv: config.vercelEnv }),
  });
}
