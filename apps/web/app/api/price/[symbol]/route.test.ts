import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, REVALIDATE_SECONDS } from "./route.js";

function withParams(symbol: string): { params: Promise<{ symbol: string }> } {
  return { params: Promise.resolve({ symbol }) };
}

function coinGeckoResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/price/[symbol]", () => {
  const originalKey = process.env.COINGECKO_DEMO_API_KEY;

  beforeEach(() => {
    process.env.COINGECKO_DEMO_API_KEY = "test-demo-key";
  });

  afterEach(() => {
    process.env.COINGECKO_DEMO_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns Bullpen's own shape on the happy path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      coinGeckoResponse(200, { bitcoin: { usd: 65432.1, usd_24h_change: 2.34, last_updated_at: 1758870000 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      symbol: "BTC-USD",
      price: 65432.1,
      changePercent: 2.34,
      time: new Date(1758870000 * 1000).toISOString(),
      source: "coingecko",
      fetchedAt: expect.any(String),
    });

    // Called server-side with the key in a header, never the query string.
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).not.toContain("test-demo-key");
    expect((calledInit.headers as Record<string, string>)["x-cg-demo-api-key"]).toBe("test-demo-key");
  });

  it("sets a scoped Access-Control-Allow-Origin for the landing app's cross-origin fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(coinGeckoResponse(200, { bitcoin: { usd: 1, usd_24h_change: 0, last_updated_at: 1758870000 } })),
    );

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://bullpen-landing.vercel.app");
  });

  it("also sets Access-Control-Allow-Origin on error responses", async () => {
    const response = await GET(new Request("http://localhost/api/price/DOGE-USD"), withParams("DOGE-USD"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://bullpen-landing.vercel.app");
  });

  it("sets Cache-Control matching the configured revalidate interval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(coinGeckoResponse(200, { bitcoin: { usd: 1, usd_24h_change: 0, last_updated_at: 1758870000 } })),
    );

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));

    expect(response.headers.get("Cache-Control")).toBe(
      `s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
    );
  });

  it("returns 502 for a malformed upstream payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(coinGeckoResponse(200, { bitcoin: { usd: "a lot" } })));

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));

    expect(response.status).toBe(502);
  });

  it("returns 503 with Retry-After on an upstream 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(coinGeckoResponse(500, { error: "internal" })));

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 503 with Retry-After on an upstream 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(coinGeckoResponse(429, { error: "rate limited" })));

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 404 for an unknown symbol", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/price/DOGE-USD"), withParams("DOGE-USD"));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a generic message and never leaks the key when it's missing", async () => {
    delete process.env.COINGECKO_DEMO_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/price/BTC-USD"), withParams("BTC-USD"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("test-demo-key");
    expect(JSON.stringify(body)).not.toMatch(/COINGECKO_DEMO_API_KEY/);
  });
});
