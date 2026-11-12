import { isOff } from "../../../lib/degradation/switches.js";
import { priceHub } from "../../../lib/trading/reads/hub.js";
import { HOBBY_MAX_DURATION_MS, openPriceStream } from "../../../lib/trading/reads/priceStream.js";

export const dynamic = "force-dynamic";
/** The most a Hobby function may run; the stream ends itself well before it (priceStream.ts). */
export const maxDuration = HOBBY_MAX_DURATION_MS / 1000;

/**
 * Live prices as server-sent events (ADR-0029). Every connection on this instance shares the instance's one read of the stored prices per interval; a viewer
 * costs the database nothing, and no viewer ever reaches a market-data provider. `Last-Event-ID` (or `?lastEventId=` for a client that makes a new
 * connection of its own) resumes: a client that already holds the current prices is sent a tick instead.
 * With the price-stream switch off the answer is 503 and the client polls `/api/stock-prices` instead.
 */
export async function GET(request: Request): Promise<Response> {
  if (isOff("price-stream")) {
    return Response.json({ error: "stream-off", message: "Live prices are paused; prices refresh by polling." }, { status: 503, headers: { "cache-control": "no-store", "x-bullpen-stream": "off", "retry-after": "60" } });
  }
  const lastEventId = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("lastEventId") ?? undefined;
  const stream = openPriceStream(priceHub(), { lastEventId, signal: request.signal });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
