import type { Decision, Submitted } from "@bullpen/db-handles";
import { isOff } from "../degradation/switches.js";
import { decide } from "./decide.js";
import { askGateway, type GatewayResult } from "./gateway.js";
import { checkHandle } from "./rules.js";

export type SaveOutcome =
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "taken" }
  /** This text was taken down after a report, for whoever had it: nothing was saved, counted or asked. */
  | { ok: false; kind: "revoked" }
  /** The player has used up their changes for the window: nothing was saved and no model was asked. */
  | { ok: false; kind: "limit"; retryAfterSeconds: number }
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

  // The limit and the name are checked inside the save, before any model call: a refusal here costs nothing.
  const saved = await deps.store.submit(userId, checked.handle);
  if (!saved.ok) {
    if (saved.reason === "limit") return { ok: false, kind: "limit", retryAfterSeconds: saved.retryAfterSeconds };
    return { ok: false, kind: saved.reason };
  }
  return { ok: true, status: await moderateSaved(saved.handleId, checked.handle, deps) };
}

/**
 * Asks the model about a handle that is already saved as pending and records the verdict: the second half of saving, and what an admin's retry runs for a handle
 * that was stuck. It never throws for a failed model call (that is a verdict: review) and returns 'pending' when the verdict could not be recorded. A retry does not
 * count as a change by the player, since the player did nothing.
 */
export async function moderateSaved(handleId: string, handle: string, deps: ModerationDeps): Promise<"approved" | "review" | "pending"> {
  const log = deps.log ?? ((line: string) => console.info(line));
  // The handle-moderation switch (ADR-0031): off, no question is asked and every handle goes to review. Saving a handle still works and nothing else changes.
  const answer = isOff("handle-moderation")
    ? ({ ok: false, reason: "unavailable", latencyMs: 0 } satisfies GatewayResult)
    : await (deps.ask ?? askGateway)(handle).catch((): GatewayResult => ({ ok: false, reason: "unavailable", latencyMs: 0 }));
  const verdict = decide(answer);
  try {
    const recorded = await deps.store.record({ handleId, handle, outcome: verdict.outcome, probability: verdict.probability, ...(verdict.outcome === "review" ? { reason: verdict.reason } : {}) });
    // false: the player changed the handle meanwhile, or it was decided: the newer state stands, and this answer is dropped.
    if (!recorded) return "pending";
  } catch {
    log(JSON.stringify({ at: "moderation", handleId, status: "pending", probability: null, latencyMs: answer.latencyMs }));
    return "pending";
  }
  log(JSON.stringify({ at: "moderation", handleId, status: verdict.outcome, probability: verdict.probability, latencyMs: answer.latencyMs }));
  return verdict.outcome;
}
