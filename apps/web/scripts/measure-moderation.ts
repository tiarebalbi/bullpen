// Runs the labelled handle set against the AI Gateway and reports what ADR-0027 asked to measure.
//
//   pnpm --filter @bullpen/web measure:moderation -- --out ../../post-facts/bonus-run.json [--threshold 0.9]
//
// The gateway key comes from the environment and is read by the moderation module, not here; nothing here prints or stores it. With no key every
// answer would be "no key", so the script stops before it writes anything. It makes about 140 requests, one at a time, and costs fractions of a cent
// if the team pays per request.
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

const region = await probeGatewayRegion();
console.log(`measure-moderation: ${labelled.length} handles, edge region ${region ?? "unknown"}, runner ${process.env.VERCEL_REGION ? `Vercel ${process.env.VERCEL_REGION}` : "not on Vercel"}`);

const measured: Measured[] = [];
for (const [index, item] of labelled.entries()) {
  const result = await askGateway(item.handle);
  if (index === 0 && !result.ok && result.reason === "no-key") {
    console.error("measure-moderation: the gateway key is not set in this environment, so nothing was asked. Set it, then run again.");
    process.exit(2);
  }
  measured.push({ ...item, result });
}

const summary = summarize(measured, threshold);
const verdicts = compareToTargets(summary, TARGETS);
const table = thresholdTable(measured, [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99, 0.995]);
const safe = lowestSafeThreshold(measured);

console.log(`\nAt threshold ${threshold} (approved only when strictly above it):`);
for (const v of verdicts) console.log(`  ${v.met === null ? "n/a " : v.met ? "met " : "MISS"}  ${v.target}: ${v.actual}`);
console.log(`  failures (timeouts, 429s and the like, all sent to review): ${summary.failures}`);
console.log(`  latency ms: p50 ${summary.latencyMs.p50}, p95 ${summary.latencyMs.p95}, max ${summary.latencyMs.max}`);
console.log(`  total cost: ${summary.totalCostUsd === null ? "not reported" : `$${summary.totalCostUsd.toFixed(8)}`}`);
console.log(`  probability, clean:  ${JSON.stringify(summary.probability.clean)}`);
console.log(`  probability, reject: ${JSON.stringify(summary.probability.reject)}`);
console.log(`  highest probability given to a reject: ${safe ?? "none answered"}`);
if (summary.rejectsApproved.length > 0) console.log(`  rejects approved: ${summary.rejectsApproved.join(", ")}`);
console.log("\nthreshold  rejects approved  clean to review");
for (const row of table) console.log(`${String(row.threshold).padEnd(10)} ${String(row.rejectsApproved).padEnd(17)} ${row.cleanToReview}`);

if (out) {
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        runner: { vercelRegion: process.env.VERCEL_REGION ?? null, edgeRegion: region, node: process.version },
        threshold,
        summary,
        verdicts,
        thresholds: table,
        results: measured.map((m) => ({
          handle: m.handle,
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
  console.log(`\nwrote ${out}`);
}
