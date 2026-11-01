import { describe, expect, it, vi } from "vitest";
import { askGateway, probeGatewayRegion } from "./gateway.js";

const ok = (probability: unknown = 0.98, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "typesafe-ai/jev", answers: { acceptable: { type: "boolean", probability } }, usage: { inputTokens: 200, outputTokens: 20 }, providerMetadata: { gateway: { cost: "0.00001155" } }, ...extra }), { status: 200 });
const key = "test-key-not-real";

describe("asking the gateway", () => {
  it("sends the handle text and the fixed question, to one model, and nothing about the player", async () => {
    const fetcher = vi.fn(async () => ok());
    const result = await askGateway("Bull_Run", { fetch: fetcher as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: true, probability: 0.98, costUsd: 0.00001155 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/evaluate");
    expect(init.method).toBe("POST");
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual(["authorization", "content-type"]);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["model", "questions", "state"]);
    expect(body.model).toBe("typesafe-ai/jev");
    expect(body.state).toBe("Bull_Run");
    expect(JSON.stringify(body.questions)).toContain("Is this handle acceptable to show publicly?");
    expect(JSON.stringify(body)).not.toMatch(/user|email|session|ip|providerOptions|fallback/i);
  });

  it("makes no request without a key, and says so", async () => {
    const fetcher = vi.fn();
    for (const apiKey of [undefined, "", "   "]) {
      expect(await askGateway("abc", { fetch: fetcher as unknown as typeof fetch, apiKey })).toMatchObject({ ok: false, reason: "no-key" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a timeout when the answer is too slow", async () => {
    const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    const result = await askGateway("abc", { fetch: slow as unknown as typeof fetch, apiKey: key, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("reports a rate limit, and any other refusal (budget, key, server) as unavailable", async () => {
    const reply = (status: number) => askGateway("abc", { fetch: (async () => new Response("{}", { status })) as unknown as typeof fetch, apiKey: key });
    expect(await reply(429)).toMatchObject({ ok: false, reason: "rate-limited", httpStatus: 429 });
    // the status travels with a refusal, so a caller can tell "no credits" (402) from "key refused" (401, 403); the body never does
    for (const status of [401, 402, 403, 500, 503]) expect(await reply(status)).toMatchObject({ ok: false, reason: "unavailable", httpStatus: status });
  });

  it("reports a network failure as unavailable", async () => {
    const result = await askGateway("abc", { fetch: (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["not JSON", new Response("nope", { status: 200 })],
    ["no answers", new Response(JSON.stringify({ model: "typesafe-ai/jev" }), { status: 200 })],
    ["a different type", new Response(JSON.stringify({ answers: { acceptable: { type: "score", score: 3 } } }), { status: 200 })],
    ["a probability above 1", ok(1.5)],
    ["a probability below 0", ok(-0.1)],
    ["a probability that is a string", ok("0.99")],
    ["a null probability", ok(null)],
    ["an answer from another model", ok(0.99, { model: "someone/else" })],
    ["an array", new Response("[]", { status: 200 })],
  ])("reports %s as malformed", async (_label, response) => {
    const result = await askGateway("abc", { fetch: (async () => response) as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("keeps the probability when the cost is missing", async () => {
    const result = await askGateway("abc", { fetch: (async () => ok(0.5, { providerMetadata: {} })) as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: true, probability: 0.5, costUsd: null });
  });

  it("measures latency with the clock it is given", async () => {
    let now = 1000;
    const result = await askGateway("abc", { fetch: (async () => { now += 137; return ok(); }) as unknown as typeof fetch, apiKey: key, clock: () => now });
    expect(result.latencyMs).toBe(137);
  });
});

describe("probing where a request is served from", () => {
  it("reads the region from x-vercel-id, sending no key and no handle", async () => {
    const fetcher = vi.fn(async () => new Response("", { headers: { "x-vercel-id": "iad1::abcde-123" } }));
    expect(await probeGatewayRegion({ fetch: fetcher as unknown as typeof fetch })).toBe("iad1");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe("https://ai-gateway.vercel.sh");
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it("is null when the header is absent or the host cannot be reached", async () => {
    expect(await probeGatewayRegion({ fetch: (async () => new Response("")) as unknown as typeof fetch })).toBeNull();
    expect(await probeGatewayRegion({ fetch: (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch })).toBeNull();
  });
});

describe("the test setup's guard", () => {
  it("refuses a test that reaches the real gateway without mocking it, even with a key in the environment", async () => {
    const result = await askGateway("abc", { apiKey: "test-key-not-real" });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    await expect(fetch("https://ai-gateway.vercel.sh/v1/evaluate")).rejects.toThrow(/real AI Gateway/);
  });
});
