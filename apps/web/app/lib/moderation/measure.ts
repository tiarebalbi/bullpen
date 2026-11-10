import { decide } from "./decide.js";
import type { GatewayResult } from "./gateway.js";

export type Label = "clean" | "reject";

export interface LabelledHandle {
  /** "clean-001", "reject-017": how a run refers to a handle in its output, so a reject's text never has to be printed. */
  id: string;
  handle: string;
  label: Label;
  /** Only for a reject: insult, slur, threat, sexual or impersonation. */
  category?: string;
}

export interface Measured extends LabelledHandle {
  result: GatewayResult;
}

/** Reads clean.txt or reject.txt: one handle per line, `#` comments and blank lines ignored, a reject's category after a tab. */
export function parseLabelled(text: string, label: Label): LabelledHandle[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .map((line, index) => {
      const [handle, category] = line.split("\t");
      return { id: `${label}-${String(index + 1).padStart(3, "0")}`, handle: handle!.trim(), label, ...(category ? { category: category.trim() } : {}) };
    });
}

/** The nearest-rank percentile (p between 0 and 100) of a list of numbers; NaN for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

export interface Spread {
  count: number;
  min: number;
  p05: number;
  median: number;
  p95: number;
  max: number;
}

export function spread(values: readonly number[]): Spread {
  return { count: values.length, min: percentile(values, 0), p05: percentile(values, 5), median: percentile(values, 50), p95: percentile(values, 95), max: percentile(values, 100) };
}

export interface Summary {
  threshold: number;
  total: { clean: number; reject: number };
  /** The ids of the rejects the model would approve: the number that must be 0. Ids, not text. */
  rejectsApproved: string[];
  /** Clean handles that would go to review, for any reason, and how many of those were a failure and not an answer. */
  cleanToReview: { count: number; share: number; failures: number; ids: string[] };
  failures: number;
  latencyMs: { p50: number; p95: number; max: number };
  costPerDecisionUsd: number | null;
  totalCostUsd: number | null;
  probability: { clean: Spread; reject: Spread };
}

/** What a run shows at one threshold, using the same `decide` the product uses. */
export function summarize(measured: readonly Measured[], threshold: number): Summary {
  const clean = measured.filter((m) => m.label === "clean");
  const reject = measured.filter((m) => m.label === "reject");
  const answered = (set: readonly Measured[]): number[] => set.flatMap((m) => (m.result.ok ? [m.result.probability] : []));
  const toReview = clean.filter((m) => decide(m.result, threshold).outcome === "review");
  const costs = measured.flatMap((m) => (m.result.ok && m.result.costUsd !== null ? [m.result.costUsd] : []));
  const latencies = measured.map((m) => m.result.latencyMs);
  return {
    threshold,
    total: { clean: clean.length, reject: reject.length },
    rejectsApproved: reject.filter((m) => decide(m.result, threshold).outcome === "approved").map((m) => m.id),
    cleanToReview: { count: toReview.length, share: clean.length === 0 ? 0 : toReview.length / clean.length, failures: toReview.filter((m) => !m.result.ok).length, ids: toReview.map((m) => m.id) },
    failures: measured.filter((m) => !m.result.ok).length,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: percentile(latencies, 100) },
    costPerDecisionUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0) / costs.length,
    totalCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    probability: { clean: spread(answered(clean)), reject: spread(answered(reject)) },
  };
}

export interface Targets {
  rejectsApproved: number;
  maxCleanToReviewShare: number;
  p95LatencyMs: number;
  maxCostPerDecisionUsd: number;
}

/** The targets in the brief: 0 rejects approved; at most 1 in 20 clean to review; p95 under 500 ms; under $0.0001 a decision. */
export const TARGETS: Targets = { rejectsApproved: 0, maxCleanToReviewShare: 1 / 20, p95LatencyMs: 500, maxCostPerDecisionUsd: 0.0001 };

export interface Verdict {
  target: string;
  met: boolean | null;
  actual: string;
}

export function compareToTargets(summary: Summary, targets: Targets = TARGETS): Verdict[] {
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  return [
    { target: "0 rejects accepted", met: summary.rejectsApproved.length <= targets.rejectsApproved, actual: `${summary.rejectsApproved.length} of ${summary.total.reject}` },
    {
      target: "at most 1 in 20 clean sent to review",
      met: summary.cleanToReview.share <= targets.maxCleanToReviewShare,
      actual: `${summary.cleanToReview.count} of ${summary.total.clean} (${pct(summary.cleanToReview.share)})`,
    },
    { target: "p95 latency under 500 ms", met: Number.isNaN(summary.latencyMs.p95) ? null : summary.latencyMs.p95 < targets.p95LatencyMs, actual: `${summary.latencyMs.p95} ms` },
    {
      target: "cost under $0.0001 a decision",
      met: summary.costPerDecisionUsd === null ? null : summary.costPerDecisionUsd < targets.maxCostPerDecisionUsd,
      actual: summary.costPerDecisionUsd === null ? "no cost field in the answers" : `$${summary.costPerDecisionUsd.toFixed(8)}`,
    },
  ];
}

/**
 * Candidate thresholds with the two numbers that trade against each other. A threshold only approves a probability strictly above it,
 * so the smallest one that approves no reject is the highest probability any reject got.
 */
export function thresholdTable(measured: readonly Measured[], candidates: readonly number[]): Array<{ threshold: number; rejectsApproved: number; cleanToReview: number }> {
  return candidates.map((threshold) => {
    const s = summarize(measured, threshold);
    return { threshold, rejectsApproved: s.rejectsApproved.length, cleanToReview: s.cleanToReview.count };
  });
}

/** The highest probability the model gave to a reject: the lowest threshold that approves none of them. Null when no reject was answered. */
export function lowestSafeThreshold(measured: readonly Measured[]): number | null {
  const rejects = measured.flatMap((m) => (m.label === "reject" && m.result.ok ? [m.result.probability] : []));
  return rejects.length === 0 ? null : Math.max(...rejects);
}
