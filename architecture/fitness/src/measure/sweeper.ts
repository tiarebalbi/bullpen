/**
 * Decision 1, the daemon option: what the sweeper and the sweep route cost, measured on a throwaway local Postgres.
 *
 * It refuses to run against anything but a local database, so it moves no Neon transfer; every row it writes is a test row
 * (handle prefix, quote source `test`) and lives only in the container it starts. What it measures, and what it only computes:
 *
 *   measured  - CPU, statements and wire bytes of one tick (in process, and the Next server end to end), CPU of the real
 *               daemon process per call, new connections per call at the daemon's cadence, TLS cost per call, and how long a
 *               real daemon takes to find an order stuck in `accepted`.
 *   computed  - calls a day and Neon awake time under each cadence, from the ticker's own wait function on a virtual clock;
 *               the cost in CU-hours and dollars from cost/allowances.json. Neon itself is not measured here.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { DerivedVenue, TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE, createPool, dbPriceSource, markWorking, placeMarketBuy, submitOrder, tick } from "@bullpen/db-trading";
import setup, { type DbUrls } from "../db-integration/global-setup.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const outDir = process.env.PART4_REPORT_DIR ?? join(repoRoot, "architecture", "reports", "part-04", "raw");

const admin = process.env.TEST_DATABASE_URL ?? "";
if (!/^postgres:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(admin)) throw new Error("This script runs only against a local Postgres (TEST_DATABASE_URL on 127.0.0.1). Use db:measure-sweeper.");

const log = (line: string): void => console.log(line);
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;
const round = (n: number, d = 3): number => Math.round(n * 10 ** d) / 10 ** d;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- process CPU by `ps` (10 ms resolution): the daemon and the Next server are other processes ------------------------
function psTable(): { pid: number; ppid: number; cpu: number }[] {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,time="], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, time] = line.trim().split(/\s+/);
      const parts = time!.split(":").map(Number);
      const seconds = parts.reduce((acc, p) => acc * 60 + p, 0);
      return { pid: Number(pid), ppid: Number(ppid), cpu: seconds };
    });
}
function treeCpu(root: number): number {
  const table = psTable();
  const inTree = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of table) if (!inTree.has(p.pid) && inTree.has(p.ppid)) (inTree.add(p.pid), (grew = true));
  }
  return table.filter((p) => inTree.has(p.pid)).reduce((sum, p) => sum + p.cpu, 0);
}

// ---- setup ------------------------------------------------------------------------------------------------------------
let urls!: DbUrls;
const teardown = await setup({ provide: (_key, value) => void (urls = value) });
const trading = createPool(urls.tradingOwner, 4);
const marketData = createPool(urls.marketDataOwner, 2);
const sockets: { bytesRead: number; bytesWritten: number }[] = [];
trading.on("connect", (client) => sockets.push((client as unknown as { connection: { stream: { bytesRead: number; bytesWritten: number } } }).connection.stream));
const wireBytes = (): number => sockets.reduce((n, s) => n + s.bytesRead + s.bytesWritten, 0);
let statements = 0;
const originalQuery = pg.Client.prototype.query as (...args: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function (this: unknown, ...args: unknown[]) {
  statements += 1;
  return originalQuery.apply(this, args);
};

async function seedOrders(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const symbol = `M${randomUUID().slice(0, 7).toUpperCase()}`;
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() - interval '20 minutes', 100, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
    const account = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 10000) RETURNING account_id", [`${TEST_HANDLE_PREFIX}${randomUUID()}`]);
    const order = await submitOrder(trading, { accountId: account.rows[0]!.account_id, symbol, quantity: "10", clientOrderId: randomUUID() });
    await markWorking(trading, order.orderId);
    // a newer quote above the order's ceiling: the order stays open and nothing fills, the steady state of "orders waiting"
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), 110, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
  }
}
const clear = (): Promise<unknown> => trading.query("TRUNCATE trading.order_events, trading.fills, trading.reservations, trading.ledger, trading.positions, trading.orders, trading.accounts CASCADE");

const results: Record<string, unknown> = { at: new Date().toISOString(), host: `${process.platform}/${process.arch}`, node: process.version, database: "postgres:17-alpine in Docker on the same machine" };

// ---- A. one tick, in process ------------------------------------------------------------------------------------------
async function tickCost(label: string, n: number): Promise<Record<string, number>> {
  const venue = new DerivedVenue(trading, { seed: 1, prices: dbPriceSource(trading) });
  for (let i = 0; i < 20; i += 1) await tick(trading, venue, new Date());
  const c0 = process.cpuUsage();
  const s0 = statements;
  const b0 = wireBytes();
  const t0 = performance.now();
  for (let i = 0; i < n; i += 1) await tick(trading, venue, new Date());
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(c0);
  const row = { ticks: n, cpuMsPerTick: round((cpu.user + cpu.system) / 1000 / n), statementsPerTick: round((statements - s0) / n, 2), wireBytesPerTick: round((wireBytes() - b0) / n, 0), wallMsPerTick: round(wall / n) };
  log(`A ${label}: ${JSON.stringify(row)}`);
  return row;
}
await clear();
const tickIdle = await tickCost("idle (no orders)", 300);
await seedOrders(5);
const tickBusy = await tickCost("5 open orders, none fillable", 300);
results.tickInProcess = { idle: tickIdle, fiveOpenOrders: tickBusy, note: "CPU is this process's own (the pg driver and the sweep code), not Next's, and not Postgres's. Wire bytes are the Postgres protocol without TLS; Neon's TLS adds a few percent." };

// ---- B. the Next server end to end -----------------------------------------------------------------------------------
const secret = randomBytes(24).toString("hex");
const webPort = 3199;
const web: ChildProcess = spawn("pnpm", ["exec", "next", "start", "-p", String(webPort)], {
  cwd: join(repoRoot, "apps", "web"),
  env: { ...process.env, DATABASE_URL_TRADING: urls.tradingOwner, SWEEP_SECRET: secret, NODE_ENV: "production" },
  stdio: "ignore",
});
const sweepUrl = `http://127.0.0.1:${webPort}/api/internal/sweep`;
const call = (token = secret): Promise<Response> => fetch(sweepUrl, { method: "POST", headers: { authorization: `Bearer ${token}` } });
for (let i = 0; ; i += 1) {
  try {
    if ((await call("x")).status === 401) break;
  } catch {
    /* not up yet */
  }
  if (i > 120) throw new Error("the Next server did not start");
  await sleep(500);
}
async function routeCost(label: string, n: number): Promise<Record<string, number>> {
  for (let i = 0; i < 40; i += 1) await call();
  const before = treeCpu(web.pid!);
  const times: number[] = [];
  let bodyBytes = 0;
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    const response = await call();
    bodyBytes += (await response.text()).length;
    times.push(performance.now() - t0);
  }
  const cpu = treeCpu(web.pid!) - before;
  const row = { calls: n, serverCpuMsPerCall: round((cpu * 1000) / n), responseMsP50: round(pct(times, 50)), responseMsP95: round(pct(times, 95)), responseBodyBytes: round(bodyBytes / n, 0) };
  log(`B ${label}: ${JSON.stringify(row)}`);
  return row;
}
await clear();
const routeIdle = await routeCost("idle", 600);
await seedOrders(5);
const routeBusy = await routeCost("5 open orders, none fillable", 600);
results.nextServer = { idle: routeIdle, fiveOpenOrders: routeBusy, note: "`next start` of the production build on this machine; CPU is the whole process tree by ps (10 ms resolution over the run). Not Vercel's Fluid compute: it is the order of magnitude, not the bill." };

// ---- C. the real daemon process ---------------------------------------------------------------------------------------
let proxied = 0;
const proxy = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  proxied += 1;
  const upstream = await fetch(sweepUrl, { method: "POST", headers: { authorization: req.headers.authorization ?? "" } });
  res.writeHead(upstream.status, { "content-type": "application/json" }).end(await upstream.text());
});
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/internal/sweep`;
const daemonMain = join(repoRoot, "apps", "sweeper", "src", "main.ts");
function startDaemon(env: Record<string, string>): ChildProcess {
  return spawn(process.execPath, [daemonMain], { env: { PATH: process.env.PATH ?? "", SWEEPER_TARGET_URL: proxyUrl, SWEEPER_TOKEN: secret, ...env }, stdio: "ignore" });
}
async function daemonCost(label: string, activeMs: number, seconds: number): Promise<Record<string, number>> {
  const child = startDaemon({ SWEEPER_ACTIVE_MS: String(activeMs) });
  await sleep(1500); // node's own start-up is not a tick
  const cpu0 = treeCpu(child.pid!);
  const calls0 = proxied;
  await sleep(seconds * 1000);
  const cpu = treeCpu(child.pid!) - cpu0;
  const calls = proxied - calls0;
  child.kill("SIGTERM");
  await new Promise((r) => child.on("exit", r));
  const row = { seconds, calls, daemonCpuMsPerCall: round((cpu * 1000) / calls), daemonCpuPercentOfOneCore: round((cpu / seconds) * 100, 2) };
  log(`C ${label}: ${JSON.stringify(row)}`);
  return row;
}
const daemonBusy = await daemonCost("daemon polling every 25 ms against 5 open orders (accelerated: the ticker's code, a shorter wait)", 25, 20);
// idle daemon: sleeping between calls costs nothing but the timer; measure a daemon that waits a long time
const idleChild = startDaemon({ SWEEPER_ACTIVE_MS: "60000", SWEEPER_MAX_MS: "60000" });
await sleep(2000);
const idleCpu0 = treeCpu(idleChild.pid!);
await sleep(20_000);
const idleCpu = treeCpu(idleChild.pid!) - idleCpu0;
idleChild.kill("SIGTERM");
await new Promise((r) => idleChild.on("exit", r));
log(`C daemon sleeping 20 s between calls: ${round(idleCpu * 1000)} ms of CPU in 20 s`);
results.daemonProcess = { busy: daemonBusy, sleepingCpuMsIn20s: round(idleCpu * 1000), note: "Plain HTTP to a local proxy, so no TLS (measured separately below). CPU by ps over the run, node's start-up excluded." };

// ---- C2. connections per call at the daemon's cadence, and what TLS costs per call -------------------------------------
let connections = 0;
const probe = createHttpServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end('{"open":0}'));
probe.on("connection", () => (connections += 1));
await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
const probeUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}/`;
for (let i = 0; i < 3; i += 1) {
  await fetch(probeUrl, { method: "POST" }).then((r) => r.text());
  if (i < 2) await sleep(6000);
}
log(`C2 three calls 6 s apart with Node's fetch opened ${connections} connection(s)`);
results.connectionsPerCall = { callsSixSecondsApart: 3, connectionsOpened: connections, note: "Node's fetch keeps an idle connection for 4 s by default, so at the 5 s cadence and slower every call opens a connection." };
probe.close();

const certDir = mkdtempSync(join(tmpdir(), "sweeper-measure-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(certDir, "k.pem"), "-out", join(certDir, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
const tlsServer = createHttpsServer({ key: readFileSync(join(certDir, "k.pem")), cert: readFileSync(join(certDir, "c.pem")) }, (_req, res) => res.writeHead(200, { "content-type": "application/json" }).end('{"open":0}'));
await new Promise<void>((r) => tlsServer.listen(0, "127.0.0.1", r));
const tlsUrl = `https://localhost:${(tlsServer.address() as AddressInfo).port}/`;
const httpProbe = createHttpServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end('{"open":0}'));
await new Promise<void>((r) => httpProbe.listen(0, "127.0.0.1", r));
const plainUrl = `http://127.0.0.1:${(httpProbe.address() as AddressInfo).port}/`;
const client = (url: string, closeEach: boolean, n: number): Promise<number> => {
  const script = `const u=${JSON.stringify(url)};const n=${n};const h=${closeEach ? '{connection:"close"}' : "{}"};(async()=>{for(let i=0;i<30;i++)await(await fetch(u,{method:"POST",headers:h})).text();const c=process.cpuUsage();for(let i=0;i<n;i++)await(await fetch(u,{method:"POST",headers:h})).text();const d=process.cpuUsage(c);console.log((d.user+d.system)/1000/n)})()`;
  // asynchronous: the servers it calls live in this process, whose event loop must keep running
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script], { env: { PATH: process.env.PATH ?? "", NODE_TLS_REJECT_UNAUTHORIZED: "0" }, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("exit", (code) => (code === 0 ? resolve(Number(out)) : reject(new Error(`client exited ${code}`))));
  });
};
const tls = {
  httpKeepAliveCpuMsPerCall: round(await client(plainUrl, false, 500)),
  httpsKeepAliveCpuMsPerCall: round(await client(tlsUrl, false, 500)),
  httpsNewConnectionCpuMsPerCall: round(await client(tlsUrl, true, 300)),
  httpNewConnectionCpuMsPerCall: round(await client(plainUrl, true, 300)),
};
log(`C2 client CPU per call: ${JSON.stringify(tls)}`);
results.clientTlsCost = { ...tls, note: "The client process's own CPU (user+system) per call to a local server with a self-signed RSA-2048 certificate (verification off). A real certificate chain adds verification work; this is a floor for the HTTPS case." };
tlsServer.close();
httpProbe.close();

// ---- E. how fast a real daemon finds an order stuck in accepted -------------------------------------------------------
await clear();
await seedOrders(1);
const latencyChild = startDaemon({});
await sleep(8000); // first tick, then the 5 s cadence (one open order)
const latencies: number[] = [];
for (let trial = 0; trial < 8; trial += 1) {
  await sleep(Math.floor(Math.random() * 5000));
  const symbol = `L${randomUUID().slice(0, 7).toUpperCase()}`;
  await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() - interval '20 minutes', 100, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
  const account = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 10000) RETURNING account_id", [`${TEST_HANDLE_PREFIX}${randomUUID()}`]);
  const order = await submitOrder(trading, { accountId: account.rows[0]!.account_id, symbol, quantity: "10", clientOrderId: randomUUID() });
  await trading.query("UPDATE trading.orders SET updated_at = now() - interval '31 seconds' WHERE order_id = $1", [order.orderId]); // already past the 30 s accept timeout
  const t0 = performance.now();
  for (;;) {
    const state = (await trading.query<{ status: string }>("SELECT status FROM trading.orders WHERE order_id = $1", [order.orderId])).rows[0]!.status;
    if (state !== "accepted") break;
    await sleep(25);
    if (performance.now() - t0 > 30_000) throw new Error("the daemon did not find the stuck order in 30 s");
  }
  latencies.push(performance.now() - t0);
}
latencyChild.kill("SIGTERM");
await new Promise((r) => latencyChild.on("exit", r));
const latency = { trials: latencies.length, minMs: round(Math.min(...latencies), 0), p50Ms: round(pct(latencies, 50), 0), maxMs: round(Math.max(...latencies), 0), allMs: latencies.map((l) => round(l, 0)) };
log(`E stuck accepted order, real daemon at the 5 s cadence: ${JSON.stringify(latency)}`);
results.detectionLatencyActive = { ...latency, note: "Time from an order being past the accept timeout until the daemon's tick moved it out of accepted, with orders already open (so the 5 s cadence). When the daemon is idle the wait is the idle ceiling, computed below, not measured." };

// ---- F. what one order costs: the lifecycle (accepted, working, filled, released) against Part 3's one-transaction buy -------
const TABLES = ["orders", "reservations", "fills", "order_events", "ledger", "positions"] as const;
async function tableState(): Promise<{ rows: Record<string, number>; bytes: number }> {
  const rows: Record<string, number> = {};
  for (const t of TABLES) rows[t] = Number((await trading.query<{ n: string }>(`SELECT count(*) AS n FROM trading.${t}`)).rows[0]!.n);
  const size = await trading.query<{ b: string }>(`SELECT sum(pg_total_relation_size(('trading.' || t)::regclass)) AS b FROM unnest($1::text[]) AS t`, [[...TABLES]]);
  return { rows, bytes: Number(size.rows[0]!.b) };
}
async function perOrder(label: string, n: number, one: (symbol: string, accountId: string) => Promise<void>): Promise<Record<string, unknown>> {
  await clear();
  await trading.query("VACUUM FULL trading.orders, trading.reservations, trading.fills, trading.order_events, trading.ledger, trading.positions");
  const prepared: { symbol: string; accountId: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const symbol = `F${randomUUID().slice(0, 7).toUpperCase()}`;
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), 100, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
    const account = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 10000) RETURNING account_id", [`${TEST_HANDLE_PREFIX}${randomUUID()}`]);
    prepared.push({ symbol, accountId: account.rows[0]!.account_id });
  }
  const before = await tableState();
  const s0 = statements;
  const b0 = wireBytes();
  const c0 = process.cpuUsage();
  for (const p of prepared) await one(p.symbol, p.accountId);
  const cpu = process.cpuUsage(c0);
  const after = await tableState();
  const rows = Object.fromEntries(TABLES.map((t) => [t, round((after.rows[t]! - before.rows[t]!) / n, 2)]));
  const row = { orders: n, statementsPerOrder: round((statements - s0) / n, 2), wireBytesPerOrder: round((wireBytes() - b0) / n, 0), cpuMsPerOrderInThisProcess: round((cpu.user + cpu.system) / 1000 / n), rowsWrittenPerOrder: rows, tableAndIndexBytesAddedPerOrder: round((after.bytes - before.bytes) / n, 0) };
  log(`F ${label}: ${JSON.stringify(row)}`);
  return row;
}
const venueForCost = new DerivedVenue(trading, { seed: 1, prices: dbPriceSource(trading), partialRate: 0 });
const lifecycleCost = await perOrder("lifecycle: submit, working, one fill, release", 100, async (symbol, accountId) => {
  const order = await submitOrder(trading, { accountId, symbol, quantity: "10", clientOrderId: randomUUID() });
  await markWorking(trading, order.orderId);
  await tick(trading, venueForCost, new Date());
});
const buyCost = await perOrder("Part 3: one-transaction market buy", 100, async (symbol, accountId) => {
  await placeMarketBuy(trading, { accountId, symbol, quantity: "10" });
});
results.costPerOrder = { lifecycle: lifecycleCost, partThreeBuy: buyCost, note: "Local Postgres, no TLS. The lifecycle row includes one tick for the order; with several orders open a tick is shared between them. Table bytes include indexes and come from pg_total_relation_size after VACUUM FULL, so the page size (8 kB) makes a small run coarse." };

// ---- D. calls a day and Neon awake time under each cadence, on a virtual clock ----------------------------------------
const tickerModule = (await import(pathToFileURL(join(repoRoot, "apps", "sweeper", "src", "ticker.ts")).href)) as { run: (options: Record<string, unknown>, signal: AbortSignal) => Promise<void> };
const DAY = 86_400_000;
const SUSPEND_AFTER = 5 * 60_000;
async function simulate(openAt: (t: number) => number, maxMs: number, fail = false): Promise<{ callsPerDay: number; neonAwakeHoursPerDay: number }> {
  let t = 0;
  const callTimes: number[] = [];
  const controller = new AbortController();
  await tickerModule.run(
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
const scenarios: { name: string; open: (t: number) => number; fail?: boolean }[] = [
  { name: "no order all day", open: () => 0 },
  { name: "orders open for one hour a day", open: (t) => (t >= 10 * 3_600_000 && t < 11 * 3_600_000 ? 3 : 0) },
  { name: "an order is always open", open: () => 3 },
  { name: "the route fails all day", open: () => 0, fail: true },
];
const cadences = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
const cost = { cuPerCompute: 0.25, usdPerCuHour: 0.106, daysInMonth: 30 };
const modelRows: Record<string, unknown>[] = [];
for (const s of scenarios) {
  for (const maxMs of cadences) {
    const r = await simulate(s.open, maxMs, s.fail);
    const awakeHoursMonth = r.neonAwakeHoursPerDay * cost.daysInMonth;
    modelRows.push({ scenario: s.name, idleCeilingMinutes: maxMs / 60_000, callsPerDay: r.callsPerDay, callsPerMonth: r.callsPerDay * cost.daysInMonth, neonAwakeHoursPerDay: r.neonAwakeHoursPerDay, neonCuHoursPerMonth: round(awakeHoursMonth * cost.cuPerCompute, 1), neonUsdPerMonthForComputeAlone: round(awakeHoursMonth * cost.cuPerCompute * cost.usdPerCuHour, 2) });
  }
}
console.table(modelRows);
results.cadenceModel = { computed: true, assumptions: { neonSuspendsAfterMinutes: 5, computeCu: cost.cuPerCompute, usdPerCuHour: cost.usdPerCuHour, daysInMonth: cost.daysInMonth, source: "cost/allowances.json (Launch plan, scale-to-zero at 5 minutes) and the ticker's own wait function on a virtual clock" }, rows: modelRows };

// ---- done -------------------------------------------------------------------------------------------------------------
web.kill("SIGTERM");
proxy.close();
await trading.end();
await marketData.end();
await teardown();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sweeper-measure.json"), `${JSON.stringify(results, null, 2)}\n`);
log(`wrote sweeper-measure.json`);
process.exit(0);
