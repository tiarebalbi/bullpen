/* eslint-disable @typescript-eslint/no-explicit-any -- reads the untyped JSON the runs wrote */
/**
 * Prints the tables post-facts/part-05.md quotes, from the run files in post-facts/part-05-runs/. Nothing here is computed from anything but those files.
 *   tsx src/load/summarize.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "post-facts", "part-05-runs");
const runs: Record<string, any> = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) runs[file.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, file), "utf8"));
const ms = (n: number | null | undefined): string => (n === null || n === undefined ? "–" : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(n < 10 ? 1 : 0)} ms`);
const pct = (n: number | null | undefined): string => (n === null || n === undefined ? "–" : `${(n * 100).toFixed(1)} %`);
const num = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined ? "–" : n.toFixed(digits));
const failed = (d: any): string => Object.entries<boolean>(d.thresholds ?? {}).filter(([k, ok]) => !ok && !/>=0/.test(k)).map(([k]) => k.replace(/^http_req_/, "").replace(/ rate<|: /, " ")).join("; ") || "none";
const names = (prefix: string): string[] => Object.keys(runs).filter((k) => k.startsWith(prefix)).sort();

console.log("\n## step (the 9:30 step)");
console.log("| run | history | sweeper woke after | drain | order p50/p95/p99 | account p95 | goodput/s of offered | dropped | thresholds failed | invariants |");
for (const name of [...names("before-step"), ...names("step-")]) {
  const r = runs[name], d = r.derived;
  console.log(`| ${name} | ${r.historyOrdersPerPlayer ?? "?"}/player | ${ms(d.sweeperWokeForTheOpenAfterMs)} | ${num(d.drainMs / 1000, 1)} s | ${ms(d.orderLatencyMs?.p50)} / ${ms(d.orderLatencyMs?.p95)} / ${ms(d.orderLatencyMs?.p99)} | ${ms(d.accountPollLatencyMs?.p95)} | ${num(d.goodputPerSecond)} of ${num(d.offeredRequestsPerSecond)} | ${d.droppedIterations} | ${failed(d)} | ${d.invariantProblems.length ? d.invariantProblems.join("; ") : "hold"} |`);
}
console.log("\n## polling");
console.log("| run | screens | prices | DB txns/s | req/s served | account p95 | leaderboard p95 | prices p95 | dropped | reads pool waiting (peak) | thresholds failed |");
for (const name of [...names("before-polling"), ...names("polling-")]) {
  const d = runs[name].derived;
  console.log(`| ${name} | ${d.screens} | ${d.variant} | ${num(d.dbTransactionsPerSecond)} | ${num(d.requestsPerSecond)} | ${ms(d.latencyMsByKind.account?.p95)} | ${ms(d.latencyMsByKind.leaderboard?.p95)} | ${ms(d.latencyMsByKind.prices?.p95)} | ${d.droppedIterations} | ${d.peaks.readsPoolWaiting} | ${failed(d)} |`);
}
console.log("\n## sse");
console.log("| run | connections target | peak clients | opened | hub DB reads (total) | DB reads/s at peak | DB txns/s at peak | viewers per DB read | peak fds | peak RSS | provider calls first→last | dropped |");
for (const name of names("sse-").filter((n) => /^sse-\d+$/.test(n))) {
  const d = runs[name].derived;
  console.log(`| ${name} | ${d.connectionsTarget} | ${d.peakClients} | ${d.totalOpened} | ${d.hubReadsTotal} | ${num(d.dbReadsPerSecondAtPeak, 2)} | ${num(d.dbTransactionsPerSecondAtPeak)} | ${num(d.viewersPerDbRead, 1)} | ${d.peakFileDescriptors} | ${d.peakRssMb} MB | ${d.providerCalls.first?.calls}→${d.providerCalls.last?.calls} | ${d.droppedIterations} |`);
}
console.log("\n## leaderboard");
console.log("| run | DB txns/s | req/s served | leaderboard p50/p95/p99 | error rate | dropped | thresholds failed |");
for (const name of names("leaderboard-")) {
  const d = runs[name].derived, l = d.latencyMsByKind.leaderboard;
  console.log(`| ${name} | ${num(d.dbTransactionsPerSecond)} | ${num(d.requestsPerSecond)} | ${ms(l?.p50)} / ${ms(l?.p95)} / ${ms(l?.p99)} | ${pct(d.errorRateByKind.leaderboard)} | ${d.droppedIterations} | ${failed(d)} |`);
}
console.log("\n## isolation");
console.log("| run | pools | reads/s | db cpu | orders alone p50/p95/p99 | orders + reads p50/p95/p99 | goodput orders (alone → with reads) | reads p95 (account/board) | dropped | pool waiting peak (orders/reads/shared) |");
for (const name of [...names("before-iso"), ...names("iso-")]) {
  const r = runs[name], d = r.derived, a = d.ordersAlone, b = d.ordersWithReadStampede;
  console.log(`| ${name} | ${d.pools} | ${name.match(/r(\d+)/)?.[1]} | ${r.environment.dbCpuFraction} | ${ms(a.orderLatencyMs?.p50)} / ${ms(a.orderLatencyMs?.p95)} / ${ms(a.orderLatencyMs?.p99)} | ${ms(b.orderLatencyMs?.p50)} / ${ms(b.orderLatencyMs?.p95)} / ${ms(b.orderLatencyMs?.p99)} | ${a.goodput} → ${b.goodput} | ${ms(d.readsDuringStampede.account?.p95)} / ${ms(d.readsDuringStampede.leaderboard?.p95)} | ${d.droppedIterations} | ${d.peaks.ordersPoolWaiting}/${d.peaks.readsPoolWaiting}/${d.peaks.sharedPoolWaiting} |`);
}
for (const name of names("stress-")) {
  const r = runs[name], d = r.derived;
  console.log(`\n## ${name} (db cpu ${r.environment.dbCpuFraction}, ${d.phaseSeconds} s per phase)`);
  console.log("events:", d.events.map((e: any) => `${e.atSeconds}s ${e.what}`).join(" | "));
  console.log("| phase | order probes (status:count) | order p95 | account probes | account p95 | prices probes (stale seen) | k6 order p95 / error | k6 account p95 |");
  for (const [phase, p] of Object.entries<any>(d.byPhase)) {
    const f = (x: any) => Object.entries(x.statuses).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`| ${phase} | ${f(p.probes.order)} | ${ms(p.probes.order.p95)} | ${f(p.probes.account)} | ${ms(p.probes.account.p95)} | ${f(p.probes.prices)} (${p.probes.prices.sawStalePrices ? "stale" : "fresh"}) | ${ms(p.k6.orderP95Ms)} / ${pct(p.k6.orderErrorRate)} | ${ms(p.k6.accountP95Ms)} |`);
  }
  console.log("recovery after restore (ms):", JSON.stringify(d.recoveryMsAfterRestore), "| invariants:", d.invariantProblems.length ? d.invariantProblems : "hold", "| dropped:", d.droppedIterations, "| provider calls:", JSON.stringify(d.providerCalls));
}
for (const name of ["multixact", "sse-300s-cut"]) if (runs[name]) console.log(`\n## ${name}\n`, JSON.stringify(runs[name], null, 1));
