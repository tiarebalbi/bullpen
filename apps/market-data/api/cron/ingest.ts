import { marketDataConfig } from "../../src/config/index.js";
import { handleIngestRequest } from "../../src/cron.js";
import { marketDataPool } from "../../src/db/pool.js";
import { runStockIngest } from "../../src/ingest.js";

/** The daily end-of-day ingest: a cron calls it after the close, and it can be called by hand with the same secret. */
export async function GET(request: Request): Promise<Response> {
  const config = marketDataConfig();
  return handleIngestRequest(request, {
    config,
    runIngest: (symbols, apiKey) =>
      runStockIngest({
        pool: marketDataPool(),
        apiKey,
        now: new Date(),
        fetchFn: (url) => fetch(url),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: {
          warn: (message, fields) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
          info: (message, fields) => console.info(JSON.stringify({ level: "info", message, ...fields })),
        },
        symbols,
        vercelEnv: config.vercelEnv,
      }),
  });
}
