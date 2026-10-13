import { describe, expect, it, vi } from "vitest";
import { REVALIDATE_SECONDS, handlePrice, type PriceDeps } from "./price.js";

const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const good = { bitcoin: { usd: 65432.1, usd_24h_change: 2.34, last_updated_at: 1758870000 } };
const origins = { production: "https://bullpen-landing.vercel.app", custom: "https://bullpen.tiarebalbi.com" };

function deps(overrides: Partial<PriceDeps> & { upstream?: Response | Error } = {}) {
  const calls: Array<[string, { headers: Record<string, string> }]> = [];
  const reserved: number[] = [];
  const built: PriceDeps = {
    apiKey: "test-demo-key",
    fetchFn: async (url, init) => {
      calls.push([url, init]);
      if (overrides.upstream instanceof Error) throw overrides.upstream;
      return overrides.upstream ?? response(200, good);
    },
    now: () => new Date("2026-10-13T16:00:00Z"),
    landingOrigins: origins,
    reserveCall: async () => void reserved.push(1),
    ...overrides,
  };
  return { built, calls, reserved };
}

const get = (symbol: string, d: PriceDeps, origin?: string) => handlePrice(new Request(`http://localhost/api/price/${symbol}`, origin ? { headers: { origin } } : undefined), symbol, d);

describe("handlePrice", () => {
  it("returns Bullpen's own shape on the happy path, with the key in a header and never in the url", async () => {
    const { built, calls } = deps();
    const result = await get("BTC-USD", built);

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date(1758870000 * 1000).toISOString(), source: "coingecko", fetchedAt: "2026-10-13T16:00:00.000Z" });
    expect(calls[0]![0]).not.toContain("test-demo-key");
    expect(calls[0]![1].headers["x-cg-demo-api-key"]).toBe("test-demo-key");
  });

  it("reserves a call against the budget before the request leaves, and not for an unknown symbol", async () => {
    const known = deps();
    await get("BTC-USD", known.built);
    expect(known.reserved).toHaveLength(1);

    const unknown = deps();
    expect((await get("DOGE-USD", unknown.built)).status).toBe(404);
    expect(unknown.reserved).toHaveLength(0);
    expect(unknown.calls).toHaveLength(0);
  });

  it("answers 503 with Retry-After and calls nobody when the budget refuses", async () => {
    const { built, calls } = deps({ reserveCall: async () => { throw new Error("budget"); } });
    const result = await get("BTC-USD", built);

    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe(String(REVALIDATE_SECONDS));
    expect(calls).toHaveLength(0);
  });

  it("echoes back an allowed landing origin: production, the custom domain, and both preview shapes", async () => {
    for (const origin of [origins.production, origins.custom, "https://bullpen-landing-git-fix-landing-fidelity-tiare-balbis-projects.vercel.app", "https://bullpen-landing-kqhdj1xpj-tiare-balbis-projects.vercel.app"]) {
      const result = await get("BTC-USD", deps().built, origin);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(result.headers.get("Vary")).toBe("Origin");
    }
  });

  it("sets no CORS header for any other origin, never a wildcard", async () => {
    expect((await get("BTC-USD", deps().built, "https://evil.example.com")).headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("also sets the CORS header on error responses", async () => {
    expect((await get("DOGE-USD", deps().built, origins.production)).headers.get("Access-Control-Allow-Origin")).toBe(origins.production);
  });

  it("sets Cache-Control from the configured revalidate interval", async () => {
    expect((await get("BTC-USD", deps().built)).headers.get("Cache-Control")).toBe(`s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`);
  });

  it("returns 502 for a malformed upstream payload", async () => {
    expect((await get("BTC-USD", deps({ upstream: response(200, { bitcoin: { usd: "a lot" } }) }).built)).status).toBe(502);
  });

  it("returns 503 with Retry-After on an upstream 500, an upstream 429 and a network failure", async () => {
    for (const upstream of [response(500, {}), response(429, {}), new Error("network")]) {
      const result = await get("BTC-USD", deps({ upstream }).built);
      expect(result.status).toBe(503);
      expect(result.headers.get("Retry-After")).toBeTruthy();
    }
  });

  it("returns 404 for an unknown symbol without calling out", async () => {
    const { built, calls } = deps();
    expect((await get("DOGE-USD", built)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("returns 500 with a generic message, and calls nobody, when the key is missing", async () => {
    const fetchSpy = vi.fn();
    const { built } = deps({ apiKey: undefined, fetchFn: fetchSpy });
    const result = await get("BTC-USD", built);

    expect(result.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(await result.json())).not.toMatch(/COINGECKO|test-demo-key/);
  });
});
