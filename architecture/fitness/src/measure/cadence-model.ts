/**
 * Calls a day and Neon awake time under each idle ceiling, computed with the sweeper's own wait function (apps/sweeper/src/ticker.ts) on a virtual
 * clock for 24 hours. Neon is modelled, not measured: each call that reaches Postgres keeps the compute up for 5 minutes (scale to zero), at 0.25 CU
 * and $0.106 a CU-hour (cost/allowances.json). No database, no network. Run: `pnpm --filter @bullpen/fitness-checks cadence-model`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const round = (n: number, d = 3): number => Math.round(n * 10 ** d) / 10 ** d;

const DAY = 86_400_000;
const SUSPEND_AFTER = 5 * 60_000;
export const CADENCES_MINUTES = [1, 5, 15, 30, 60];
export const COST = { cuPerCompute: 0.25, usdPerCuHour: 0.106, daysInMonth: 30 };

type Ticker = { run: (options: Record<string, unknown>, signal: AbortSignal) => Promise<void> };
const loadTicker = async (): Promise<Ticker> => (await import(pathToFileURL(join(repoRoot, "apps", "sweeper", "src", "ticker.ts")).href)) as Ticker;

export async function simulate(ticker: Ticker, openAt: (t: number) => number, maxMs: number, fail = false): Promise<{ callsPerDay: number; neonAwakeHoursPerDay: number }> {
  let t = 0;
  const callTimes: number[] = [];
  const controller = new AbortController();
  await ticker.run(
    {
      url: "http://virtual",
      token: "t",
      maxMs,
      log: () => undefined,
      fetch: (async () => {
        callTimes.push(t);
        return fail ? new Response("no", { status: 500 }) : Response.json({ open: openAt(t) });
      }) as typeof fetch,
      sleep: async (ms: number) => {
        t += ms;
        if (t >= DAY) controller.abort();
      },
    },
    controller.signal,
  );
  let awake = 0;
  let until = -1;
  let from = 0;
  for (const c of callTimes) {
    if (c > until) {
      if (until >= 0) awake += until - from;
      from = c;
    }
    until = Math.max(until, c + SUSPEND_AFTER);
  }
  if (until >= 0) awake += Math.min(until, DAY + SUSPEND_AFTER) - from;
  return { callsPerDay: callTimes.length, neonAwakeHoursPerDay: round(Math.min(awake, DAY) / 3_600_000, 2) };
}

export const scenarios: { name: string; open: (t: number) => number; fail?: boolean }[] = [
  { name: "no order all day", open: () => 0 },
  { name: "orders open for one hour a day", open: (t) => (t >= 10 * 3_600_000 && t < 11 * 3_600_000 ? 3 : 0) },
  { name: "an order is always open", open: () => 3 },
  { name: "the route fails all day", open: () => 0, fail: true },
];

export async function cadenceModel(): Promise<{ assumptions: Record<string, unknown>; rows: Record<string, unknown>[] }> {
  const ticker = await loadTicker();
  const rows: Record<string, unknown>[] = [];
  for (const s of scenarios) {
    for (const minutes of CADENCES_MINUTES) {
      const r = await simulate(ticker, s.open, minutes * 60_000, s.fail);
      const awakeHoursMonth = r.neonAwakeHoursPerDay * COST.daysInMonth;
      rows.push({ scenario: s.name, idleCeilingMinutes: minutes, callsPerDay: r.callsPerDay, callsPerMonth: r.callsPerDay * COST.daysInMonth, neonAwakeHoursPerDay: r.neonAwakeHoursPerDay, neonCuHoursPerMonth: round(awakeHoursMonth * COST.cuPerCompute, 1), neonUsdPerMonthForComputeAlone: round(awakeHoursMonth * COST.cuPerCompute * COST.usdPerCuHour, 2) });
    }
  }
  return { assumptions: { neonSuspendsAfterMinutes: 5, computeCu: COST.cuPerCompute, usdPerCuHour: COST.usdPerCuHour, daysInMonth: COST.daysInMonth, source: "cost/allowances.json (Launch plan, scale-to-zero at 5 minutes) and the ticker's own wait function on a virtual clock" }, rows };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const model = await cadenceModel();
  console.table(model.rows);
  const outDir = process.env.PART4_REPORT_DIR ?? join(repoRoot, "architecture", "reports", "part-04", "raw");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "cadence-model.json"), `${JSON.stringify({ computedAt: new Date().toISOString(), computed: true, ...model }, null, 2)}\n`);
}
