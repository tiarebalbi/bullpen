import { reserveCall } from "./src/budget.js";
import { marketDataConfig } from "./src/config/index.js";
import { marketDataPool } from "./src/db/pool.js";
import { runStockIngest } from "./src/ingest.js";
import { handleRequest } from "./src/router.js";

const log = {
  warn: (message: string, fields: Record<string, unknown>) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
  info: (message: string, fields: Record<string, unknown>) => console.info(JSON.stringify({ level: "info", message, ...fields })),
};

/** The Market Data service's one entrypoint: the real dependencies, handed to the router. */
export default {
  fetch(request: Request): Promise<Response> {
    const config = marketDataConfig();
    return handleRequest(request, {
      price: () => ({
        apiKey: config.cryptoProviderKey,
        fetchFn: (url, init) => fetch(url, init),
        now: () => new Date(),
        landingOrigins: config.landingOrigins,
        reserveCall: () => reserveCall(marketDataPool(), "coingecko", new Date(), { vercelEnv: config.vercelEnv }),
      }),
      cron: () => ({
        config,
        runIngest: (symbols, apiKey) =>
          runStockIngest({
            pool: marketDataPool(),
            apiKey,
            now: new Date(),
            fetchFn: (url) => fetch(url),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            log,
            symbols,
            vercelEnv: config.vercelEnv,
          }),
      }),
    });
  },
};
