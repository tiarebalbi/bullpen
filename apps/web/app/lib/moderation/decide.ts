import type { ReviewReason } from "@bullpen/db-handles";
import { APPROVE_ABOVE } from "./config.js";
import type { GatewayResult } from "./gateway.js";

export type Verdict = { outcome: "approved"; probability: number } | { outcome: "review"; probability: number | null; reason: ReviewReason };

/**
 * Strictly above the threshold is approved. At it, below it, or with no usable answer, the handle goes to review: this function has no way to approve a
 * failure, a missing probability or a tie.
 */
export function decide(result: GatewayResult, threshold: number = APPROVE_ABOVE): Verdict {
  if (!result.ok) return { outcome: "review", probability: null, reason: result.reason };
  if (Number.isFinite(result.probability) && result.probability > threshold) return { outcome: "approved", probability: result.probability };
  return { outcome: "review", probability: Number.isFinite(result.probability) ? result.probability : null, reason: "below-threshold" };
}
