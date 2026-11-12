import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSwitches } from "../../../lib/degradation/testing.js";

const subscribe = vi.fn();
vi.mock("../../../lib/trading/reads/hub.js", () => ({ priceHub: () => ({ subscribe }) }));

const { GET, maxDuration } = await import("./route.js");
const { HOBBY_MAX_DURATION_MS } = await import("../../../lib/trading/reads/priceStream.js");

const get = (url = "http://x/api/prices/stream", headers: Record<string, string> = {}) => GET(new Request(url, { headers }));

beforeEach(() => {
  subscribe.mockReset().mockImplementation((write: (chunk: string) => void) => {
    write("retry: 3000\n\n");
    return () => undefined;
  });
});
let restore = (): void => undefined;
afterEach(() => {
  restore();
  vi.useRealTimers();
});

describe("GET /api/prices/stream", () => {
  it("answers a server-sent event stream that nothing may cache or buffer", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("retry: 3000\n\n");
    await reader.cancel();
  });

  it("passes Last-Event-ID to the hub, from the header or, for a client that opens a new connection, from the query", async () => {
    const a = await get("http://x/api/prices/stream", { "last-event-id": "123.2.0" });
    await a.body!.cancel();
    expect(subscribe.mock.calls[0]![1]).toBe("123.2.0");
    const b = await get("http://x/api/prices/stream?lastEventId=456.2.0");
    await b.body!.cancel();
    expect(subscribe.mock.calls[1]![1]).toBe("456.2.0");
    const c = await get();
    await c.body!.cancel();
    expect(subscribe.mock.calls[2]![1]).toBeUndefined();
  });

  it("is declared to run for no longer than Hobby allows", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBe(HOBBY_MAX_DURATION_MS); // Next needs the literal; this keeps it equal to the constant the stream's lifetime is checked against

  });

  it("with the price-stream switch off answers 503 'stream-off' at once, subscribes nobody, and says to retry later", async () => {
    restore = setSwitches("price-stream");
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("x-bullpen-stream")).toBe("off");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toMatchObject({ error: "stream-off" });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("is not turned off by another switch", async () => {
    restore = setSwitches("handle-moderation,leaderboard-refresh");
    const response = await get();
    expect(response.status).toBe(200);
    await response.body!.cancel();
  });
});
