import { handleIngestRequest, type CronDeps } from "./cron.js";
import { handlePrice, type PriceDeps } from "./price.js";

export interface RouterDeps {
  /** Built per request, so a missing variable is read when it is needed. */
  price: () => PriceDeps;
  cron: () => CronDeps;
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response => Response.json(body, { status, headers });

type Route = { kind: "price"; symbol: string } | { kind: "ingest" };

/** Which of the two routes a path is, or null: exactly `/api/price/<symbol>` or `/api/cron/ingest`, nothing deeper. */
function matchRoute(pathname: string): Route | null {
  const segments = pathname.split("/").filter(Boolean);
  const [head, ...tail] = segments;
  if (head !== "api") return null;
  if (tail.length === 2 && tail[0] === "price") return { kind: "price", symbol: decodeURIComponent(tail[1]!) };
  if (tail.length === 2 && tail[0] === "cron" && tail[1] === "ingest") return { kind: "ingest" };
  return null;
}

/**
 * The one entrypoint of the Market Data service: it serves GET /api/price/<symbol> and
 * GET /api/cron/ingest, and answers 404 for anything else and 405 for any other method on
 * those two. The top-level rewrites decide what reaches the service; this decides what it
 * does with it.
 */
export async function handleRequest(request: Request, deps: RouterDeps): Promise<Response> {
  const route = matchRoute(new URL(request.url).pathname);
  if (!route) return json({ error: "Not found." }, 404);
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  return route.kind === "price" ? handlePrice(request, route.symbol, deps.price()) : handleIngestRequest(request, deps.cron());
}
