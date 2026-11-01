import type { Decision, Submitted } from "@bullpen/db-handles";
import { decide } from "./decide.js";
import { askGateway, type GatewayResult } from "./gateway.js";
import { checkHandle } from "./rules.js";

export type SaveOutcome =
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "taken" }
  /** `pending` means saved but not decided: the decision could not be recorded, and saving the same handle again retries it. */
  | { ok: true; status: "approved" | "review" | "pending" };

export interface ModerationStore {
  submit(userId: string, handle: string): Promise<Submitted>;
  record(decision: Decision): Promise<boolean>;
}

export interface ModerationDeps {
  store: ModerationStore;
  ask?: (handle: string) => Promise<GatewayResult>;
  log?: (line: string) => void;
}

/**
 * The whole path for a handle a player saves: rules first (a failure is a form error and no model is asked), then save as pending, then one question to the model,
 * then record the verdict. Moderation failing never throws to the caller: the handle stays pending or goes to review, and sign-in and the leaderboard are untouched.
 * The log line has the handle's id, the status, the probability and the latency: never the handle's text, the answer, or who the player is.
 */
export async function saveAndModerate(userId: string, input: unknown, deps: ModerationDeps): Promise<SaveOutcome> {
  const checked = checkHandle(input);
  if (!checked.ok) return { ok: false, kind: "invalid", error: checked.error };

  const saved = await deps.store.submit(userId, checked.handle);
  if (!saved.ok) return { ok: false, kind: "taken" };

  const log = deps.log ?? ((line: string) => console.info(line));
  const answer = await (deps.ask ?? askGateway)(checked.handle).catch((): GatewayResult => ({ ok: false, reason: "unavailable", latencyMs: 0 }));
  const verdict = decide(answer);
  try {
    await deps.store.record({ handleId: saved.handleId, handle: checked.handle, outcome: verdict.outcome, probability: verdict.probability, ...(verdict.outcome === "review" ? { reason: verdict.reason } : {}) });
  } catch {
    log(JSON.stringify({ at: "moderation", handleId: saved.handleId, status: "pending", probability: null, latencyMs: answer.latencyMs }));
    return { ok: true, status: "pending" };
  }
  log(JSON.stringify({ at: "moderation", handleId: saved.handleId, status: verdict.outcome, probability: verdict.probability, latencyMs: answer.latencyMs }));
  return { ok: true, status: verdict.outcome };
}
