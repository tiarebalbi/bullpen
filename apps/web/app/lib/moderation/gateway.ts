import type { ReviewReason } from "@bullpen/db-handles";
import { MODERATION_MODEL, QUESTION_INSTRUCTIONS, QUESTION_NAME, TIMEOUT_MS } from "./config.js";

/** The one place that reaches the AI Gateway and the one place that reads its key (ADL: only this directory). */
const ENDPOINT = "https://ai-gateway.vercel.sh/v1/decisions";
/** The gateway's origin, for a test setup that must make sure no test reaches it. */
export const GATEWAY_ORIGIN = new URL(ENDPOINT).origin;

export type GatewayResult =
  | { ok: true; probability: number; costUsd: number | null; latencyMs: number }
  /** `httpStatus` is the gateway's status when it answered with a refusal, so a caller can tell "no credits" (402) from "key refused" (401, 403); never its body. */
  | { ok: false; reason: ReviewReason; latencyMs: number; httpStatus?: number };

export interface GatewayOptions {
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Defaults to the deployment's key. A missing or blank key is a failure that goes to review, with no request made. */
  apiKey?: string | undefined;
  timeoutMs?: number;
  clock?: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * Asks the model one yes or no question about a handle: POST /v1/decisions (the route that replaced the deprecated /v1/evaluate). The request carries the handle text and the fixed question and nothing else: no user,
 * email, address or session in the body, the headers or any metadata. It never throws and never falls back to another model; every failure is a result the
 * caller sends to review.
 */
export async function askGateway(handle: string, options: GatewayOptions = {}): Promise<GatewayResult> {
  const clock = options.clock ?? Date.now;
  const started = clock();
  const done = (result: Omit<Extract<GatewayResult, { ok: false }>, "latencyMs"> | Omit<Extract<GatewayResult, { ok: true }>, "latencyMs">): GatewayResult =>
    ({ ...result, latencyMs: clock() - started }) as GatewayResult;

  const apiKey = "apiKey" in options ? options.apiKey : process.env.AI_GATEWAY_API_KEY;
  if (!apiKey || apiKey.trim() === "") return done({ ok: false, reason: "no-key" });

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODERATION_MODEL, input: handle, questions: [{ type: "predicate", name: QUESTION_NAME, instructions: QUESTION_INSTRUCTIONS }] }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      redirect: "error",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return done({ ok: false, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable" });
  }

  if (response.status === 429) return done({ ok: false, reason: "rate-limited", httpStatus: 429 });
  // 401, 402 (credits or budget exhausted), 403, 5xx: all the same to the player, a handle for a person to look at.
  if (!response.ok) return done({ ok: false, reason: "unavailable", httpStatus: response.status });

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return done({ ok: false, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "malformed" });
  }
  if (!isRecord(body)) return done({ ok: false, reason: "malformed" });
  // Only an answer that says it is from the model we asked is trusted: another model's, and one that names none, both go to review, whatever they say.
  if (body.model !== MODERATION_MODEL) return done({ ok: false, reason: "malformed" });
  // The answers are an array in question order, each with its `name`; ours is the predicate called QUESTION_NAME. A refusal, another type or another name is not an answer.
  const answer = Array.isArray(body.answers) ? body.answers.find((a): a is Record<string, unknown> => isRecord(a) && a.name === QUESTION_NAME) : undefined;
  if (!answer || answer.type !== "predicate") return done({ ok: false, reason: "malformed" });
  const probability = answer.probability;
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) return done({ ok: false, reason: "malformed" });

  const meta = isRecord(body.provider_metadata) && isRecord(body.provider_metadata.gateway) ? body.provider_metadata.gateway : undefined;
  const cost = meta ? Number(meta.cost) : Number.NaN;
  return done({ ok: true, probability, costUsd: Number.isFinite(cost) ? cost : null });
}

/**
 * Where a request from here is served from: the first part of `x-vercel-id` on an unauthenticated GET to the gateway's host (for example `iad1`). It sends no
 * key and no handle, and lets a measurement say where it ran from. Null when the host cannot be reached or the header is absent.
 */
export async function probeGatewayRegion(options: Pick<GatewayOptions, "fetch" | "timeoutMs"> = {}): Promise<string | null> {
  try {
    const response = await (options.fetch ?? fetch)(GATEWAY_ORIGIN, { signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
    return response.headers.get("x-vercel-id")?.split("::")[0] ?? null;
  } catch {
    return null;
  }
}
