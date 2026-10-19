import { describe, expect, it, vi } from "vitest";
import type { CronDeps } from "./cron.js";
import type { PriceDeps } from "./price.js";
import { handleRequest, type RouterDeps } from "./router.js";

const good = { bitcoin: { usd: 65432.1, usd_24h_change: 2.34, last_updated_at: 1758870000 } };
const summary = { date: "2026-10-13", skipped: null, stored: [], alreadyHad: [], notYetPublished: [], failed: [], refused: false };

function deps() {
  const runIngest = vi.fn().mockResolvedValue(summary);
  const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(good), { status: 200 }));
  const price: PriceDeps = { apiKey: "k", fetchFn, now: () => new Date("2026-10-13T16:00:00Z"), landingOrigins: { production: "https://a.example", custom: "https://b.example" }, reserveCall: async () => undefined };
  const cron: CronDeps = { config: { cronSecret: "s3cret", stockProviderKey: "key" }, runIngest };
  const built: RouterDeps = { price: () => price, cron: () => cron };
  return { built, runIngest, fetchFn };
}

const send = (path: string, init?: RequestInit) => new Request(`https://example.test${path}`, init);

describe("handleRequest", () => {
  it("serves GET /api/price/<symbol> with the price handler", async () => {
    const { built, fetchFn } = deps();
    const response = await handleRequest(send("/api/price/BTC-USD"), built);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ symbol: "BTC-USD", price: 65432.1, source: "coingecko" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("passes the symbol the path names, so an unknown one is the price handler's 404", async () => {
    const { built, fetchFn } = deps();
    const response = await handleRequest(send("/api/price/DOGE-USD"), built);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Unknown symbol." });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("serves GET /api/cron/ingest with the cron handler, which wants the secret", async () => {
    const { built, runIngest } = deps();
    expect((await handleRequest(send("/api/cron/ingest"), built)).status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();

    const ok = await handleRequest(send("/api/cron/ingest?symbols=AAPL", { headers: { authorization: "Bearer s3cret" } }), built);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(summary);
    expect(runIngest.mock.calls[0]![0]).toEqual(["AAPL"]);
  });

  it("answers 404 for anything else: another path, a deeper path, the bare prefixes, the root", async () => {
    for (const path of ["/", "/api", "/api/price", "/api/price/", "/api/price/BTC-USD/extra", "/api/cron", "/api/cron/other", "/api/cron/ingest/more", "/api/leaderboard", "/health"]) {
      const { built } = deps();
      const response = await handleRequest(send(path), built);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toEqual({ error: "Not found." });
    }
  });

  it("answers 405 with Allow: GET for another method on either path, and calls nothing", async () => {
    for (const path of ["/api/price/BTC-USD", "/api/cron/ingest"]) {
      const { built, fetchFn, runIngest } = deps();
      const response = await handleRequest(send(path, { method: "POST" }), built);
      expect(response.status, path).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
      expect(fetchFn).not.toHaveBeenCalled();
      expect(runIngest).not.toHaveBeenCalled();
    }
  });

  it("builds a handler's dependencies only for the path that needs them", async () => {
    const { built } = deps();
    const price = vi.fn(built.price);
    const cron = vi.fn(built.cron);
    await handleRequest(send("/api/price/BTC-USD"), { price, cron });
    expect([price.mock.calls.length, cron.mock.calls.length]).toEqual([1, 0]);
    await handleRequest(send("/nowhere"), { price, cron });
    expect([price.mock.calls.length, cron.mock.calls.length]).toEqual([1, 0]);
  });
});
