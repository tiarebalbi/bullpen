import { describe, expect, it, vi } from "vitest";
import { QUESTION, QUESTION_INSTRUCTIONS } from "./config.js";
import { decide } from "./decide.js";
import { askGateway, probeGatewayRegion } from "./gateway.js";

// An answer as /v1/decisions sends it: the model, the answers as an array in question order with each one's name, usage, and provider_metadata (snake case).
const ok = (probability: unknown = 0.98, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "typesafe-ai/jev", answers: [{ type: "predicate", name: "acceptable", probability }], usage: { input_tokens: 200, output_tokens: 0, total_tokens: 200 }, provider_metadata: { gateway: { cost: "0.00001155" } }, ...extra }), { status: 200 });
const reply = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200 });
const key = "test-key-not-real";

describe("asking the gateway", () => {
  it("sends the handle text and the fixed question to /v1/decisions, to one model, and nothing about the player", async () => {
    const fetcher = vi.fn(async () => ok());
    const result = await askGateway("Bull_Run", { fetch: fetcher as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: true, probability: 0.98, costUsd: 0.00001155 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/decisions");
    expect(init.method).toBe("POST");
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual(["authorization", "content-type"]);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["input", "model", "questions"]);
    expect(body.model).toBe("typesafe-ai/jev");
    expect(body.input).toBe("Bull_Run");
    expect(JSON.stringify(body)).not.toMatch(/user|email|session|\bip\b|providerOptions|fallback/i);
  });

  it("asks one predicate named 'acceptable', with the criteria written into its instructions, and uses none of the old evaluate fields", async () => {
    const fetcher = vi.fn(async () => ok());
    await askGateway("abc", { fetch: fetcher as unknown as typeof fetch, apiKey: key });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { questions: Record<string, unknown>[] };
    // questions is an array (it was an object keyed by id), and the boolean is a predicate
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions).toHaveLength(1);
    const [question] = body.questions as [Record<string, string>];
    expect(question.type).toBe("predicate");
    expect(question.name).toBe("acceptable");
    expect(Object.keys(question).sort()).toEqual(["instructions", "name", "type"]); // no `criteria`: a predicate has none
    // the same question and the same two criteria as before, word for word, now in one string
    expect(question.instructions).toContain("Is this handle acceptable to show publicly?");
    expect(question.instructions).toContain(QUESTION.yes);
    expect(question.instructions).toContain(QUESTION.no);
    expect(question.instructions).toBe(QUESTION_INSTRUCTIONS);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('"state"');
    expect(raw).not.toContain('"boolean"');
    expect(raw).not.toContain('"criteria"');
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
    ["no answers", reply({ model: "typesafe-ai/jev" })],
    ["answers in the old shape, an object keyed by question id", reply({ model: "typesafe-ai/jev", answers: { acceptable: { type: "boolean", probability: 0.99 } } })],
    ["an empty answers array", reply({ model: "typesafe-ai/jev", answers: [] })],
    ["a different type", reply({ model: "typesafe-ai/jev", answers: [{ type: "score", name: "acceptable", score: 1 }] })],
    ["the old boolean type", reply({ model: "typesafe-ai/jev", answers: [{ type: "boolean", name: "acceptable", probability: 0.99 }] })],
    ["a refusal in the answer's place", reply({ model: "typesafe-ai/jev", answers: [{ type: "refusal", name: "acceptable" }] })],
    ["an answer to a question it was not asked", reply({ model: "typesafe-ai/jev", answers: [{ type: "predicate", name: "other", probability: 0.99 }] })],
    ["an answer with no name", reply({ model: "typesafe-ai/jev", answers: [{ type: "predicate", probability: 0.99 }] })],
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

  it("treats a valid-looking answer with no model field as a failure, so the handle goes to review", async () => {
    // a well-formed predicate answer with a probability of 0.99 that names no model at all
    const noModel = reply({ answers: [{ type: "predicate", name: "acceptable", probability: 0.99 }], provider_metadata: { gateway: { cost: "0.00001155" } } });
    const result = await askGateway("abc", { fetch: (async () => noModel) as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
    expect(decide(result)).toMatchObject({ outcome: "review", reason: "malformed", probability: null });
  });

  it.each([
    ["a null model", null],
    ["an empty model", ""],
    ["a model that is a number", 5],
    ["the right model with another provider's prefix", "openai/typesafe-ai/jev"],
    ["the right model in another case", "TypeSafe-AI/Jev"],
  ])("treats %s as a failure too: only the exact model that was asked is trusted", async (_label, model) => {
    const result = await askGateway("abc", { fetch: (async () => ok(0.99, { model })) as unknown as typeof fetch, apiKey: key });
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("finds its answer by name when other answers come with it, and reads the cost from provider_metadata", async () => {
    const many = reply({
      model: "typesafe-ai/jev",
      answers: [{ type: "predicate", name: "something_else", probability: 0.1 }, { type: "predicate", name: "acceptable", probability: 0.93 }],
      provider_metadata: { gateway: { cost: "0.0000096" } },
    });
    expect(await askGateway("abc", { fetch: (async () => many) as unknown as typeof fetch, apiKey: key })).toMatchObject({ ok: true, probability: 0.93, costUsd: 0.0000096 });
  });

  it("does not read the old camel-case providerMetadata: a cost only there is not reported", async () => {
    const old = reply({ model: "typesafe-ai/jev", answers: [{ type: "predicate", name: "acceptable", probability: 0.95 }], providerMetadata: { gateway: { cost: "0.00001155" } } });
    expect(await askGateway("abc", { fetch: (async () => old) as unknown as typeof fetch, apiKey: key })).toMatchObject({ ok: true, probability: 0.95, costUsd: null });
  });

  it("keeps the probability when the cost is missing", async () => {
    const result = await askGateway("abc", { fetch: (async () => ok(0.5, { provider_metadata: {} })) as unknown as typeof fetch, apiKey: key });
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
    await expect(fetch("https://ai-gateway.vercel.sh/v1/decisions")).rejects.toThrow(/real AI Gateway/);
  });
});
