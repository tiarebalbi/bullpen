/* eslint-disable @typescript-eslint/no-explicit-any -- k6 summaries and server stats are untyped JSON; the report reads named fields from them */
/**
 * Runs one load case locally and writes what it measured to post-facts/part-05-runs/<case>.json.
 *
 *   TEST_DATABASE_URL=<admin url of a LOCAL throwaway cluster> K6=<k6 binary> tsx src/load/run.ts <case> [--db-cpu 0.25] [--screens 1000] [--variant old|fallback]
 *     [--connections 1000] [--refresh on|off] [--label name] [--cluster 16/load]
 *
 * Cases: step, polling, sse, leaderboard, stress. Each builds its own database (stack.ts), starts the stand-in Trading App (server.ts) and, for the
 * step, the real sweeper (apps/sweeper) pointed at it. Local only; there is no option to point it anywhere else, and the database URL must be this machine's.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { cpus, platform, release } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertLocal, buildStack, type Stack } from "./stack.js";

const here = dirname(fileURLToPath(import.meta.url));
const fitnessRoot = join(here, "..", "..");
const repoRoot = join(fitnessRoot, "..", "..");
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;

const [caseName = "", ...rest] = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 && rest[at + 1] ? rest[at + 1]! : fallback;
};
const adminUrl = process.env.TEST_DATABASE_URL ?? "";
if (!adminUrl || !["step", "polling", "sse", "leaderboard", "stress", "isolation"].includes(caseName)) {
  console.error("usage: TEST_DATABASE_URL=<local admin url> K6=<k6> tsx src/load/run.ts <step|polling|sse|leaderboard|stress|isolation> [flags]");
  process.exit(1);
}
assertLocal(adminUrl);
const dbCpu = Number(flag("db-cpu", "1"));
const cluster = flag("cluster", "16/load");
const label = flag("label", `${caseName}${dbCpu < 1 ? `-db${dbCpu}` : ""}`);
const K6 = process.env.K6 ?? "k6";
const scratch = process.env.LOAD_SCRATCH ?? "/tmp";
const stackFile = join(scratch, `stack-${label}.json`);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const get = async (path: string, init?: RequestInit): Promise<any> => (await fetch(`${BASE}${path}`, init)).json();
const control = (body: unknown): Promise<any> => get("/__control", { method: "POST", body: JSON.stringify(body) });

const children: ChildProcess[] = [];
const spawnLogged = (cmd: string, args: string[], env: Record<string, string>, cwd = fitnessRoot): ChildProcess => {
  // Its own process group, so that ending it ends everything it started: pnpm starts tsx starts node, and killing only the first leaves the last running (a throttle left
  // behind this way kept throttling the database through every later run, until the runs were found to be contaminated).
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  child.stderr?.on("data", (d) => process.stderr.write(`[${cmd}] ${d}`));
  children.push(child);
  return child;
};
/** Ends a child and everything it started. */
const killGroup = (child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void => {
  try {
    if (child.pid) process.kill(-child.pid, signal);
  } catch {
    // already gone
  }
};
const cleanup = (): void => {
  for (const child of children) killGroup(child);
  try {
    execSync("pkill -CONT -f 'postgres.*16/load' || true");
  } catch {
    // nothing to continue
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function waitFor(check: () => Promise<boolean>, what: string, ms = 60_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

interface Sample { t: number; stats: any }
const timeline: Sample[] = [];
let sampler: NodeJS.Timeout | undefined;
const startSampler = (): void => {
  sampler = setInterval(() => void get("/__stats").then((stats) => timeline.push({ t: Date.now(), stats })).catch(() => undefined), 1000);
};

interface K6Result { exit: number; summary: any; out: string }
async function runK6(scenario: string, env: Record<string, string>, tag: string): Promise<K6Result> {
  const summaryFile = join(scratch, `k6-${label}-${tag}.json`);
  const args = ["run", "--no-color", "-e", `STACK=${stackFile}`, "-e", `SCENARIO=${scenario}`, "-e", `SUMMARY=${summaryFile}`, ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), join(fitnessRoot, "load", "scenarios.js")];
  const child = spawn(K6, args, { cwd: join(fitnessRoot, "load"), env: process.env });
  let out = "";
  let started: (() => void) | undefined;
  const running = new Promise<void>((resolve) => (started = resolve));
  child.stdout.on("data", (d) => {
    out += d;
    if (/running \(/.test(out)) started?.();
  });
  child.stderr.on("data", (d) => (out += d));
  const marks = { t0: 0 };
  void running.then(() => (marks.t0 = Date.now()));
  const exit: number = await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 0)));
  let summary: any = null;
  try {
    summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  } catch {
    // k6 did not get as far as a summary
  }
  return { exit, summary, out: out.slice(-4000), ...(marks.t0 ? { t0: marks.t0 } : {}) } as K6Result & { t0?: number };
}

const metric = (summary: any, name: string): Record<string, number> | undefined => summary?.metrics?.[name]?.values;
const trend = (summary: any, name: string) => {
  const v = metric(summary, name);
  return v ? { p50: v.med, p90: v["p(90)"], p95: v["p(95)"], p99: v["p(99)"], max: v.max, avg: v.avg } : null;
};
/** Whether each threshold held. k6's summary gives `{ ok }` per rule (older versions gave a boolean that meant "failed"). */
const thresholdsOf = (summary: any): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [name, m] of Object.entries<any>(summary?.metrics ?? {})) {
    for (const [rule, v] of Object.entries<any>(m.thresholds ?? {})) out[`${name}: ${rule}`] = typeof v === "object" && v !== null ? v.ok === true : v === false;
  }
  return out;
};
const rate = (summary: any, name: string): number | null => metric(summary, name)?.rate ?? null;

/** Counts per second between two stats samples. */
function perSecond(from: Sample | undefined, to: Sample | undefined, pick: (s: any) => number | undefined): number | null {
  if (!from || !to || to.t <= from.t) return null;
  const a = pick(from.stats);
  const b = pick(to.stats);
  return a === undefined || b === undefined ? null : (b - a) / ((to.t - from.t) / 1000);
}
const max = (list: number[]): number => list.reduce((m, v) => Math.max(m, v), 0);
const environment = () => ({ cores: cpus().length, cpu: cpus()[0]?.model, os: `${platform()} ${release()}`, node: process.version, postgres: "16 (local cluster, not Neon)", dbCpuFraction: dbCpu, note: "k6, the stand-in app, the sweeper and Postgres share this machine" });

async function main(): Promise<void> {
  mkdirSync(join(repoRoot, "post-facts", "part-05-runs"), { recursive: true });
  // A server or sweeper left behind by an earlier, interrupted run would hold the port.
  // (The bracket keeps pkill from matching the shell that runs it.)
  execSync("pkill -f '[s]rc/load/server.ts' || true; pkill -f '[a]pps/sweeper/src/main.ts' || true; pkill -f '[s]rc/load/throttle.ts' || true; for p in $(pgrep -u postgres); do kill -CONT $p 2>/dev/null; done; true", { stdio: "ignore", shell: "/bin/bash" });
  console.log(`building stack for ${label}…`);
  const players = 1000;
  execSync(`pg_ctlcluster 16 load status || pg_ctlcluster 16 load start`, { stdio: "ignore" });
  const history = Number(flag("history", "20"));
  const stack: Stack = await buildStack(adminUrl, players, 8, history);
  writeFileSync(stackFile, JSON.stringify(stack));

  const server = spawnLogged("pnpm", ["exec", "tsx", "src/load/server.ts", String(PORT)], { LOAD_STACK: stackFile, POOLS: flag("pools", "separate") });
  await waitFor(async () => (await fetch(`${BASE}/__health`)).ok, "the stand-in app");
  let throttle: ChildProcess | undefined;
  const startThrottle = (): void => {
    if (dbCpu < 1) throttle = spawnLogged("pnpm", ["exec", "tsx", "src/load/throttle.ts", cluster, String(dbCpu)], {});
  };
  startThrottle();

  const trading = new pg.Pool({ connectionString: stack.urls.tradingOwner, max: 2 });
  const result: Record<string, unknown> = { case: caseName, label, at: new Date().toISOString(), historyOrdersPerPlayer: history, environment: environment() };
  try {
    if (caseName === "step") await runStep(result, trading);
    if (caseName === "polling") await runPolling(result);
    if (caseName === "sse") await runSse(result);
    if (caseName === "leaderboard") await runLeaderboard(result);
    if (caseName === "isolation") await runIsolation(result);
    if (caseName === "stress") await runStress(result, stack, { restartThrottle: () => { if (throttle) killGroup(throttle); startThrottle(); } });
  } finally {
    if (sampler) clearInterval(sampler);
    result.timelineSeconds = timeline.length;
    writeFileSync(join(repoRoot, "post-facts", "part-05-runs", `${label}.json`), JSON.stringify(result, null, 1));
    await trading.end();
    killGroup(server);
    if (throttle) killGroup(throttle);
  }
  console.log(JSON.stringify(result.derived, null, 1));
}

// ---- the 9:30 step --------------------------------------------------------------------------------------------------------------------------------------------
async function runStep(result: Record<string, unknown>, trading: pg.Pool): Promise<void> {
  console.log("queueing the backlog while the market is closed…");
  const queued = await runK6("queue", {}, "queue");
  const before = await get("/__stats");
  if (before.queued !== 1000) throw new Error(`expected 1000 queued orders, found ${before.queued}`);
  // The open is scheduled, and the real sweeper is started after that, so its first call learns when the market opens and it sleeps until then, as it does at 9:30 ET.
  const LEAD_MS = 14_000;
  const opensAt = Date.now() + LEAD_MS;
  await control({ opensAt });
  const sweeper = spawnLogged("node", [join(repoRoot, "apps", "sweeper", "src", "main.ts")], { SWEEPER_TARGET_URL: `${BASE}/api/internal/sweep`, SWEEPER_TOKEN: "load" }, repoRoot);
  sweeper.stdout?.on("data", () => undefined);
  startSampler();
  await sleep(Math.max(0, opensAt - Date.now() - 6000));
  const rOrders = flag("orders", "150");
  // k6 starts its arrivals 5 s after it starts, which lands them on the open.
  const run = await runK6("step", { R_ORDERS: rOrders, R_ACCOUNT: flag("account-rate", "333"), DURATION: flag("duration", "60s"), START_AFTER: "5s" }, "step");
  // Let the backlog finish draining after the offered load ends, so the drain time is the backlog's and not the test's length.
  await waitFor(async () => (await get("/__stats")).queued === 0, "the backlog to drain", 180_000).catch(() => undefined);
  await sleep(2000);
  const after = await get("/__stats");
  const openedAt = after.controls.openedAt as number;
  const { rows } = await trading.query<{ first: Date; last: Date; n: string }>("SELECT min(at) AS first, max(at) AS last, count(*)::text AS n FROM trading.order_events WHERE kind = 'accepted' AND detail->>'atOpen' = 'true'");
  const perSecondAdmitted = await trading.query<{ s: Date; n: string }>("SELECT date_trunc('second', at) AS s, count(*)::text AS n FROM trading.order_events WHERE kind = 'accepted' AND detail->>'atOpen' = 'true' GROUP BY 1 ORDER BY 1");
  const states = await trading.query<{ status: string; n: string }>("SELECT status, count(*)::text AS n FROM trading.orders GROUP BY 1 ORDER BY 1");
  const inv = await invariantProblems(trading);
  const s = run.summary;
  const dur = Number(s?.state?.testRunDurationMs ?? 60_000) / 1000;
  const tail = timeline.filter((x) => x.t >= openedAt);
  result.derived = {
    queuedAtOpen: before.queued,
    admittedAtOpen: Number(rows[0]!.n),
    openedAt: new Date(openedAt).toISOString(),
    sweeperWokeForTheOpenAfterMs: new Date(rows[0]!.first).getTime() - openedAt,
    drainMs: new Date(rows[0]!.last).getTime() - openedAt,
    maxAdmittedInOneSecond: max(perSecondAdmitted.rows.map((r) => Number(r.n))),
    admissionsPerSecond: perSecondAdmitted.rows.map((r) => Number(r.n)),
    orderLatencyMs: trend(s, "order_latency"),
    accountPollLatencyMs: trend(s, "http_req_duration{kind:account}"),
    orderErrorRate: rate(s, "http_req_failed{kind:order}"),
    accountErrorRate: rate(s, "http_req_failed{kind:account}"),
    offeredRequestsPerSecond: Number(rOrders) + Number(flag("account-rate", "333")) + 17,
    goodputPerSecond: (metric(s, "goodput")?.count ?? 0) / dur,
    goodputCount: metric(s, "goodput")?.count,
    requestsPerSecond: metric(s, "http_reqs")?.rate,
    droppedIterations: metric(s, "dropped_iterations")?.count ?? 0,
    thresholds: thresholdsOf(s),
    finalStates: Object.fromEntries(states.rows.map((r) => [r.status, Number(r.n)])),
    invariantProblems: inv,
    firstSecondsAfterOpen: tail.slice(0, 20).map((x) => ({ s: Math.round((x.t - openedAt) / 1000), queued: x.stats.queued, ordersWaiting: x.stats.pools?.orders?.waiting, readsWaiting: x.stats.pools?.reads?.waiting, loopP99: Math.round(x.stats.eventLoopP99Ms) })),
    peaks: { ordersPoolWaiting: max(timeline.map((x) => x.stats.pools?.orders?.waiting ?? x.stats.pools?.shared?.waiting ?? 0)), readsPoolWaiting: max(timeline.map((x) => x.stats.pools?.reads?.waiting ?? 0)), eventLoopP99Ms: max(timeline.map((x) => x.stats.eventLoopP99Ms ?? 0)), connections: max(timeline.map((x) => Object.values<number>(x.stats.connectionsByApp ?? {}).reduce((a, b) => a + b, 0))) },
    sweeperCadenceSeconds: 5,
    batchSize: 100,
  };
  result.k6 = { queue: { exit: queued.exit }, step: { exit: run.exit, tail: run.out.slice(-1500) } };
}

/** Part 4's checks, in SQL: nothing negative, quantities add up, every finished order's reservation is released. */
async function invariantProblems(trading: pg.Pool): Promise<string[]> {
  const out: string[] = [];
  const neg = await trading.query("SELECT count(*)::int AS n FROM trading.accounts WHERE buying_power < 0");
  if (neg.rows[0].n) out.push(`${neg.rows[0].n} accounts have negative buying power`);
  const qty = await trading.query("SELECT count(*)::int AS n FROM trading.orders WHERE filled_qty + open_qty + cancelled_qty <> quantity");
  if (qty.rows[0].n) out.push(`${qty.rows[0].n} orders whose quantities do not add up`);
  const cash = await trading.query(
    `SELECT count(*)::int AS n FROM trading.accounts a WHERE a.buying_power + COALESCE((SELECT sum(reserved - spent - released) FROM trading.reservations x WHERE x.account_id = a.account_id), 0)
        - COALESCE((SELECT sum(delta) FROM trading.ledger l WHERE l.account_id = a.account_id AND l.asset = 'USD'), 0) <> 1000000 AND a.handle LIKE 'zz-load-%'`,
  );
  if (cash.rows[0].n) out.push(`${cash.rows[0].n} accounts whose cash does not add up`);
  return out;
}

// ---- polling stampede ------------------------------------------------------------------------------------------------------------------------------------------
async function runPolling(result: Record<string, unknown>): Promise<void> {
  const screens = flag("screens", "1000");
  const variant = flag("variant", "fallback");
  startSampler();
  await sleep(1500);
  const run = await runK6("polling", { SCREENS: screens, VARIANT: variant, DURATION: flag("duration", "60s") }, "polling");
  await sleep(1500);
  result.derived = steadyState(run, { screens: Number(screens), variant, windowFrom: 25 });
  result.k6 = { exit: run.exit };
}

/** The steady part of a run: from `windowFrom` seconds after the first sample to 5 s before the last. */
function steadyState(run: K6Result, extra: Record<string, unknown>): Record<string, unknown> {
  const from = timeline[Math.min(timeline.length - 1, Number(extra.windowFrom ?? 20))];
  const to = timeline[Math.max(0, timeline.length - 6)];
  const s = run.summary;
  return {
    ...extra,
    steadyWindowSeconds: from && to ? (to.t - from.t) / 1000 : null,
    dbTransactionsPerSecond: perSecond(from, to, (x) => x.dbXacts?.xacts),
    dbTuplesReturnedPerSecond: perSecond(from, to, (x) => x.dbXacts?.tupReturned),
    requestsPerSecond: metric(s, "http_reqs")?.rate,
    goodputPerSecond: perSecond(from, to, () => undefined),
    goodputTotal: metric(s, "goodput")?.count,
    droppedIterations: metric(s, "dropped_iterations")?.count ?? 0,
    latencyMsByKind: { account: trend(s, "http_req_duration{kind:account}"), leaderboard: trend(s, "http_req_duration{kind:leaderboard}"), prices: trend(s, "http_req_duration{kind:prices}"), sse: trend(s, "http_req_duration{kind:sse}") },
    errorRateByKind: { account: rate(s, "http_req_failed{kind:account}"), leaderboard: rate(s, "http_req_failed{kind:leaderboard}"), prices: rate(s, "http_req_failed{kind:prices}") },
    thresholds: thresholdsOf(s),
    hub: { reads: timeline.at(-1)?.stats.hub?.reads, peakClients: timeline.at(-1)?.stats.hub?.peakClients },
    providerCalls: { first: timeline[0]?.stats.providerCalls, last: timeline.at(-1)?.stats.providerCalls },
    peakFileDescriptors: max(timeline.map((x) => x.stats.fds ?? 0)),
    peaks: { ordersPoolWaiting: max(timeline.map((x) => x.stats.pools?.orders?.waiting ?? 0)), readsPoolWaiting: max(timeline.map((x) => x.stats.pools?.reads?.waiting ?? 0)), eventLoopP99Ms: max(timeline.map((x) => x.stats.eventLoopP99Ms ?? 0)), rssMb: max(timeline.map((x) => x.stats.rssMb ?? 0)) },
    connectionsByApp: timeline.at(-2)?.stats.connectionsByApp,
  };
}

// ---- SSE fan-out ------------------------------------------------------------------------------------------------------------------------------------------------
async function runSse(result: Record<string, unknown>): Promise<void> {
  const connections = flag("connections", "1000");
  startSampler();
  await sleep(1500);
  const run = await runK6("sse", { CONNECTIONS: connections, LIFE_S: flag("life", "30") }, "sse");
  await sleep(1500);
  const peak = timeline.reduce((best, x) => ((x.stats.hub?.clients ?? 0) > (best.stats.hub?.clients ?? 0) ? x : best), timeline[0]!);
  const peakIndex = timeline.indexOf(peak);
  const around = [timeline[Math.max(0, peakIndex - 3)], timeline[Math.min(timeline.length - 1, peakIndex + 3)]];
  const checks = run.summary?.metrics?.checks?.values;
  result.derived = {
    connectionsTarget: Number(connections),
    peakClients: peak.stats.hub.clients,
    totalOpened: timeline.at(-1)?.stats.counts?.sseOpened,
    hubReadsTotal: timeline.at(-1)?.stats.hub?.reads,
    hubReadFailures: timeline.at(-1)?.stats.hub?.readFailures,
    dbReadsPerSecondAtPeak: perSecond(around[0], around[1], (x) => x.hub?.reads),
    dbTransactionsPerSecondAtPeak: perSecond(around[0], around[1], (x) => x.dbXacts?.xacts),
    viewersPerDbRead: peak.stats.hub.clients / Math.max(1, timeline.at(-1)?.stats.hub?.reads ?? 1),
    peakFileDescriptors: max(timeline.map((x) => x.stats.fds ?? 0)),
    peakRssMb: max(timeline.map((x) => x.stats.rssMb ?? 0)),
    eventLoopP99Ms: max(timeline.map((x) => x.stats.eventLoopP99Ms ?? 0)),
    providerCalls: { first: timeline[0]?.stats.providerCalls, last: timeline.at(-1)?.stats.providerCalls },
    streamsCarriedPrices: checks?.rate,
    droppedIterations: metric(run.summary, "dropped_iterations")?.count ?? 0,
    thresholds: thresholdsOf(run.summary),
    timelineClients: timeline.map((x) => x.stats.hub?.clients ?? 0),
  };
  result.k6 = { exit: run.exit };
}

// ---- leaderboard stampede ---------------------------------------------------------------------------------------------------------------------------------------
async function runLeaderboard(result: Record<string, unknown>): Promise<void> {
  startSampler();
  await sleep(1500);
  const run = await runK6("leaderboard", { REFRESH: flag("refresh", "on"), R_BOARD_TOP: flag("top", "2000"), DURATION: flag("duration", "40s") }, "leaderboard");
  await sleep(1500);
  result.derived = steadyState(run, { refresh: flag("refresh", "on"), windowFrom: 32 });
  result.k6 = { exit: run.exit };
}

// ---- read/write isolation ---------------------------------------------------------------------------------------------------------------------------------------
async function runIsolation(result: Record<string, unknown>): Promise<void> {
  startSampler();
  await sleep(1500);
  const run = await runK6("isolation", { READ_RATE: flag("reads", "1800"), R_ORDERS: flag("orders", "100") }, "isolation");
  await sleep(1500);
  const s = run.summary;
  const phase = (name: string) => ({
    orderLatencyMs: trend(s, `http_req_duration{kind:order,phase:${name}}`),
    orderErrorRate: rate(s, `http_req_failed{kind:order,phase:${name}}`),
    goodput: metric(s, `goodput{phase:${name}}`)?.count,
  });
  result.derived = {
    pools: flag("pools", "separate"),
    ordersAlone: phase("alone"),
    ordersWithReadStampede: phase("stampede"),
    readsDuringStampede: {
      account: trend(s, "http_req_duration{kind:account,phase:stampede-reads}"),
      leaderboard: trend(s, "http_req_duration{kind:leaderboard,phase:stampede-reads}"),
      prices: trend(s, "http_req_duration{kind:prices,phase:stampede-reads}"),
      errorRate: { account: rate(s, "http_req_failed{kind:account,phase:stampede-reads}"), leaderboard: rate(s, "http_req_failed{kind:leaderboard,phase:stampede-reads}") },
    },
    droppedIterations: metric(s, "dropped_iterations")?.count ?? 0,
    peaks: { ordersPoolWaiting: max(timeline.map((x) => x.stats.pools?.orders?.waiting ?? 0)), readsPoolWaiting: max(timeline.map((x) => x.stats.pools?.reads?.waiting ?? 0)), sharedPoolWaiting: max(timeline.map((x) => x.stats.pools?.shared?.waiting ?? 0)), eventLoopP99Ms: max(timeline.map((x) => x.stats.eventLoopP99Ms ?? 0)) },
    connectionsByApp: timeline.at(-2)?.stats.connectionsByApp,
  };
  result.k6 = { exit: run.exit };
}

// ---- the stress run ---------------------------------------------------------------------------------------------------------------------------------------------
interface Probe { t: number; kind: "order" | "account" | "prices"; status: number; ms: number; reason?: string; stale?: boolean }
async function runStress(result: Record<string, unknown>, stack: Stack, hooks: { restartThrottle: () => void }): Promise<void> {
  const phases = ["baseline", "feed-down", "quota-exhausted", "moderation-down", "leaderboard-stampede", "cold-database", "recovery"];
  const phaseS = Number(process.env.PHASE_S ?? 40);
  startSampler();
  await sleep(1500);
  const probes: Probe[] = [];
  let probing = true;
  void (async () => {
    let n = 0;
    while (probing) {
      const account = stack.accounts[n++ % stack.accounts.length]!;
      const h = { "x-account": account, "content-type": "application/json" };
      const probe = async (kind: Probe["kind"], url: string, init: RequestInit): Promise<void> => {
        const started = Date.now();
        try {
          const res = await fetch(`${BASE}${url}`, { ...init, signal: AbortSignal.timeout(5000) });
          const body: any = await res.json().catch(() => ({}));
          probes.push({ t: started, kind, status: res.status, ms: Date.now() - started, reason: body.reason ?? body.error, stale: Array.isArray(body.rows) ? body.rows.some((r: any) => r.stale) : undefined });
        } catch {
          probes.push({ t: started, kind, status: 0, ms: Date.now() - started });
        }
      };
      await probe("order", "/api/orders", { method: "POST", headers: h, body: JSON.stringify({ symbol: "LD02", quantity: "1", clientOrderId: `probe-${n}-${Date.now()}` }) });
      await probe("account", "/api/orders", { headers: h });
      await probe("prices", "/api/stock-prices", {});
      await sleep(100);
    }
  })();

  const events: { at: number; what: string }[] = [];
  let t0 = 0;
  const at = (phase: string, offsetS: number, what: string, action: () => Promise<unknown> | void): void => {
    const when = phases.indexOf(phase) * phaseS + offsetS;
    setTimeout(() => {
      events.push({ at: Date.now(), what });
      void Promise.resolve(action()).catch((e) => console.error(what, e));
    }, when * 1000 - (Date.now() - t0));
  };
  const k6 = spawn(K6, ["run", "--no-color", "-e", `STACK=${stackFile}`, "-e", "SCENARIO=stress", "-e", `SUMMARY=${join(scratch, `k6-${label}.json`)}`, "-e", `PHASE_S=${phaseS}`, join(fitnessRoot, "load", "scenarios.js")], { cwd: join(fitnessRoot, "load"), env: process.env });
  let out = "";
  k6.stdout.on("data", (d) => {
    out += d;
    if (!t0 && /running \(/.test(out)) {
      t0 = Date.now();
      schedule();
    }
  });
  k6.stderr.on("data", (d) => (out += d));
  const schedule = (): void => {
    at("feed-down", 5, "feed down: every stored price goes stale", () => control({ quotes: "stale" }));
    at("feed-down", 30, "feed restored", () => control({ quotes: "fresh" }));
    at("quota-exhausted", 5, "provider quota exhausted; no new prices can be fetched", async () => {
      events.push({ at: Date.now(), what: `quota: ${JSON.stringify((await control({ quota: "exhausted", quotes: "stale" })).quota)}` });
    });
    at("quota-exhausted", 30, "quota window renewed, prices fresh", () => control({ quotes: "fresh" }));
    at("moderation-down", 5, "moderation provider down", () => control({ moderation: "down" }));
    at("moderation-down", 30, "moderation provider back", () => control({ moderation: "ok" }));
    at("leaderboard-stampede", 5, "leaderboard stampede (k6 adds the extra arrivals)", () => undefined);
    at("cold-database", 5, "database stopped (scale-to-zero)", () => void execSync("pg_ctlcluster 16 load stop -m fast"));
    at("cold-database", 8, "database resumed (cold)", () => { execSync("pg_ctlcluster 16 load start"); hooks.restartThrottle(); });
  };
  await new Promise<void>((resolve) => k6.on("close", () => resolve()));
  probing = false;
  await sleep(500);
  const summary = (() => { try { return JSON.parse(readFileSync(join(scratch, `k6-${label}.json`), "utf8")); } catch { return null; } })();

  const windowOf = (phase: string) => ({ from: t0 + phases.indexOf(phase) * phaseS * 1000, to: t0 + (phases.indexOf(phase) + 1) * phaseS * 1000 });
  const byPhase: Record<string, unknown> = {};
  for (const phase of phases) {
    const w = windowOf(phase);
    const inPhase = probes.filter((p) => p.t >= w.from && p.t < w.to);
    const summarize = (kind: Probe["kind"]) => {
      const list = inPhase.filter((p) => p.kind === kind);
      const statuses: Record<string, number> = {};
      for (const p of list) statuses[`${p.status}${p.reason ? `:${p.reason}` : ""}`] = (statuses[`${p.status}${p.reason ? `:${p.reason}` : ""}`] ?? 0) + 1;
      const ms = list.map((p) => p.ms).sort((a, b) => a - b);
      return { n: list.length, statuses, p50: ms[Math.floor(ms.length * 0.5)] ?? null, p95: ms[Math.floor(ms.length * 0.95)] ?? null, max: ms.at(-1) ?? null, sawStalePrices: kind === "prices" ? list.some((p) => p.stale) : undefined };
    };
    const tag = (m: string) => m.replace("}", `,phase:${phase}}`);
    byPhase[phase] = {
      probes: { order: summarize("order"), account: summarize("account"), prices: summarize("prices") },
      k6: {
        orderP95Ms: metric(summary, tag("http_req_duration{kind:order}"))?.["p(95)"] ?? null,
        orderErrorRate: metric(summary, tag("http_req_failed{kind:order}"))?.rate ?? null,
        accountP95Ms: metric(summary, tag("http_req_duration{kind:account}"))?.["p(95)"] ?? null,
        goodput: metric(summary, "goodput{phase:" + phase + "}")?.count ?? null,
      },
    };
  }
  // Recovery: from each restore, how long until three probes of every kind in a row are answered (not 5xx / no answer).
  const restores: [string, string][] = [["feed-down", "feed restored"], ["quota-exhausted", "quota window renewed, prices fresh"], ["moderation-down", "moderation provider back"], ["cold-database", "database resumed (cold)"]];
  const recovery: Record<string, number | null> = {};
  for (const [phase, what] of restores) {
    const restoredAt = events.find((e) => e.what === what)?.at;
    if (!restoredAt) { recovery[phase] = null; continue; }
    const after = probes.filter((p) => p.t >= restoredAt);
    let run = 0;
    let at: number | null = null;
    for (const p of after) {
      const answered = p.status >= 200 && p.status < 500 && !(p.kind === "order" && p.status === 422 && p.reason === "stale-price");
      run = answered ? run + 1 : 0;
      if (run >= 9) { at = p.t; break; }
    }
    recovery[phase] = at === null ? null : at - restoredAt;
  }
  const trading = new pg.Pool({ connectionString: stack.urls.tradingOwner, max: 1 });
  const inv = await invariantProblems(trading).catch((e) => [`could not check: ${e.message}`]);
  await trading.end();
  result.derived = {
    phaseSeconds: phaseS,
    events: events.map((e) => ({ atSeconds: Math.round((e.at - t0) / 100) / 10, what: e.what })),
    byPhase,
    recoveryMsAfterRestore: recovery,
    invariantProblems: inv,
    k6Thresholds: thresholdsOf(summary),
    droppedIterations: metric(summary, "dropped_iterations")?.count ?? 0,
    providerCalls: { first: timeline[0]?.stats.providerCalls, last: timeline.at(-1)?.stats.providerCalls },
  };
  result.k6 = { tail: out.slice(-1500) };
}

await main();
// The sweeper and the stand-in app are children with open pipes: end them and leave, or the process would wait for them.
cleanup();
process.exit(0);
