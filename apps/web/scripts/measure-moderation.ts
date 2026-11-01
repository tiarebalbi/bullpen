// Runs the labelled handle set against the AI Gateway and reports what ADR-0027 asked to measure.
//
//   export AI_GATEWAY_API_KEY=<a temporary key>      # read by the moderation module, not by this script
//   pnpm --filter @bullpen/web measure:moderation -- --out ../../post-facts/bonus-run.json [--threshold 0.9]
//
// It prints no secret, no request header and no response body, and it names a reject only by its id (reject-017) and category, never by its text.
// It makes 146 requests, one at a time. If the gateway refuses because the team has no credits (HTTP 402) it says so plainly and stops at once; if it
// refuses the key, it says that and stops. With no key it stops before asking anything.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APPROVE_ABOVE } from "../app/lib/moderation/config.js";
import { askGateway, probeGatewayRegion } from "../app/lib/moderation/gateway.js";
import { TARGETS, compareToTargets, lowestSafeThreshold, parseLabelled, summarize, thresholdTable, type Measured } from "../app/lib/moderation/measure.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const threshold = Number(flag("--threshold") ?? APPROVE_ABOVE);
const out = flag("--out");
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
  console.error("measure-moderation: --threshold is a number from 0 to 1.");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "moderation-set");
const labelled = [...parseLabelled(readFileSync(join(dir, "clean.txt"), "utf8"), "clean"), ...parseLabelled(readFileSync(join(dir, "reject.txt"), "utf8"), "reject")];

const REFUSALS: Record<number, string> = {
  402: "The gateway refused the request because the team has no credits (HTTP 402). Nothing was measured and nothing was spent. A top-up is the owner's decision; run this again after it.",
  401: "The gateway did not accept the key (HTTP 401). Check that the temporary key is the one exported in this shell. Nothing was measured.",
  403: "The gateway refused the request (HTTP 403): the key, the team or a missing payment method. Nothing was measured.",
};

const region = await probeGatewayRegion();
const where = process.env.VERCEL_REGION ? `a Vercel function in ${process.env.VERCEL_REGION}` : `this machine (${process.platform} ${process.arch}, node ${process.version}), not Vercel`;
console.log(`Run from: ${where}. The gateway's nearest edge answered from ${region ?? "an unknown region"}. ${labelled.length} handles, one request at a time.`);

const measured: Measured[] = [];
for (const [index, item] of labelled.entries()) {
  const result = await askGateway(item.handle);
  if (!result.ok && result.reason === "no-key") {
    console.error("measure-moderation: the gateway key is not set in this shell, so nothing was asked. Export it, then run again.");
    process.exit(2);
  }
  if (!result.ok && result.httpStatus !== undefined && REFUSALS[result.httpStatus]) {
    console.error(`measure-moderation: ${REFUSALS[result.httpStatus]} (stopped after ${index + 1} request${index === 0 ? "" : "s"}.)`);
    process.exit(3);
  }
  measured.push({ ...item, result });
}

const summary = summarize(measured, threshold);
const verdicts = compareToTargets(summary, TARGETS);
const candidates = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99, 0.995];
const table = thresholdTable(measured, candidates);
const safe = lowestSafeThreshold(measured);
const byId = new Map(measured.map((m) => [m.id, m]));
const fixed = (n: number): string => (Number.isFinite(n) ? n.toFixed(4) : "n/a");
const spread = (s: { count: number; min: number; p05: number; median: number; p95: number; max: number }): string => `n=${s.count} min ${fixed(s.min)}, p05 ${fixed(s.p05)}, median ${fixed(s.median)}, p95 ${fixed(s.p95)}, max ${fixed(s.max)}`;

console.log(`\nAt threshold ${threshold} (a handle is approved only when its probability is strictly above it):`);
for (const v of verdicts) console.log(`  ${v.met === null ? "n/a " : v.met ? "met " : "MISS"}  ${v.target}: ${v.actual}`);
console.log(`  rejects accepted (by id): ${summary.rejectsApproved.length === 0 ? "none" : summary.rejectsApproved.map((id) => `${id} [${byId.get(id)?.category}]`).join(", ")}`);
console.log(`  clean sent to review (id, handle, probability or reason): ${summary.cleanToReview.count === 0 ? "none" : ""}`);
for (const id of summary.cleanToReview.ids) {
  const m = byId.get(id)!;
  console.log(`    ${id}  ${m.handle}  ${m.result.ok ? fixed(m.result.probability) : `failure: ${m.result.reason}`}`);
}
console.log(`  failures (timeouts, 429s and the like, all sent to review): ${summary.failures}`);
console.log(`  latency ms, measured from here: p50 ${summary.latencyMs.p50}, p95 ${summary.latencyMs.p95}, max ${summary.latencyMs.max}`);
console.log(`  cost per decision, from the gateway's own cost field: ${summary.costPerDecisionUsd === null ? "not reported" : `$${summary.costPerDecisionUsd.toFixed(8)}`}; total ${summary.totalCostUsd === null ? "not reported" : `$${summary.totalCostUsd.toFixed(8)}`}`);
console.log(`  probability spread, clean:  ${spread(summary.probability.clean)}`);
console.log(`  probability spread, reject: ${spread(summary.probability.reject)}`);
console.log(`  highest probability given to any reject: ${safe === null ? "none answered" : fixed(safe)} (the lowest threshold that approves none of them)`);
console.log("\nThreshold candidates:");
console.log("  threshold  rejects accepted  clean to review");
for (const row of table) console.log(`  ${String(row.threshold).padEnd(10)} ${String(row.rejectsApproved).padEnd(16)} ${row.cleanToReview}`);

if (out) {
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        runner: { description: where, vercelRegion: process.env.VERCEL_REGION ?? null, edgeRegion: region, node: process.version },
        threshold,
        summary,
        verdicts,
        thresholds: table,
        results: measured.map((m) => ({
          id: m.id,
          label: m.label,
          category: m.category ?? null,
          ok: m.result.ok,
          probability: m.result.ok ? m.result.probability : null,
          reason: m.result.ok ? null : m.result.reason,
          latencyMs: m.result.latencyMs,
          costUsd: m.result.ok ? m.result.costUsd : null,
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${out} (ids, probabilities, latencies and costs; no handle text)`);
}
