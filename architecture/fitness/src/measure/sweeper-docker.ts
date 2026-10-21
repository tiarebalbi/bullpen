/**
 * The sweeper as the container it ships in (apps/sweeper/Dockerfile), against a throwaway local Postgres and the real sweep route:
 * does a stuck order get found, how fast, and does a SIGTERM stop it inside the 30 s grace. Local only; every row is a test row.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { TEST_HANDLE_PREFIX, TEST_QUOTE_SOURCE, createPool, markWorking, submitOrder } from "@bullpen/db-trading";
import setup, { type DbUrls } from "../db-integration/global-setup.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const outDir = process.env.PART4_REPORT_DIR ?? join(repoRoot, "architecture", "reports", "part-04", "raw");
if (!/^postgres:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(process.env.TEST_DATABASE_URL ?? "")) throw new Error("Local Postgres only: use db:measure-sweeper-docker.");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;
const lines: string[] = [];
const log = (line: string): void => {
  console.log(line);
  lines.push(line);
};

let urls!: DbUrls;
const teardown = await setup({ provide: (_k, v) => void (urls = v) });
const trading = createPool(urls.tradingOwner, 4);
const marketData = createPool(urls.marketDataOwner, 2);
const secret = randomBytes(24).toString("hex");
// A server left over from an earlier run would answer the readiness check below with its own secret and database: refuse to start beside one.
if (await fetch("http://127.0.0.1:3198/", { signal: AbortSignal.timeout(1500) }).then(() => true, () => false)) throw new Error("Port 3198 already answers: stop the earlier `next start` first.");
const web: ChildProcess = spawn("pnpm", ["exec", "next", "start", "-p", "3198", "-H", "0.0.0.0"], {
  detached: true,
  cwd: join(repoRoot, "apps", "web"),
  env: { ...process.env, DATABASE_URL_TRADING: urls.tradingOwner, SWEEP_SECRET: secret, NODE_ENV: "production" },
  stdio: "ignore",
});
for (let i = 0; ; i += 1) {
  try {
    if ((await fetch("http://127.0.0.1:3198/api/internal/sweep", { method: "POST" })).status === 401) break;
  } catch {
    /* not up yet */
  }
  if (i > 120) throw new Error("the Next server did not start");
  await sleep(500);
}

const image = "bullpen-sweeper:measure";
execFileSync("docker", ["build", "-q", "-t", image, join(repoRoot, "apps", "sweeper")], { stdio: "inherit" });
log(`built ${image} from apps/sweeper/Dockerfile`);

const seed = async (aged: boolean, hold: boolean): Promise<string> => {
  const symbol = `D${randomUUID().slice(0, 7).toUpperCase()}`;
  await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now() - interval '20 minutes', 100, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
  const account = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 10000) RETURNING account_id", [`${TEST_HANDLE_PREFIX}${randomUUID()}`]);
  const order = await submitOrder(trading, { accountId: account.rows[0]!.account_id, symbol, quantity: "10", clientOrderId: randomUUID() });
  if (hold) {
    await markWorking(trading, order.orderId);
    await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), 110, $2, now() + interval '1 hour')", [symbol, TEST_QUOTE_SOURCE]);
  }
  if (aged) await trading.query("UPDATE trading.orders SET updated_at = now() - interval '31 seconds' WHERE order_id = $1", [order.orderId]);
  return order.orderId;
};
const status = async (id: string): Promise<string> => (await trading.query<{ status: string }>("SELECT status FROM trading.orders WHERE order_id = $1", [id])).rows[0]!.status;

async function run(name: string, env: Record<string, string>, trials: number): Promise<{ min: number; p50: number; max: number; all: number[] }> {
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  execFileSync("docker", ["run", "-d", "--name", name, "--add-host=host.docker.internal:host-gateway", "-e", "SWEEPER_TARGET_URL=http://host.docker.internal:3198/api/internal/sweep", "-e", `SWEEPER_TOKEN=${secret}`, ...envArgs, image], { stdio: "ignore" });
  await sleep(2000);
  const times: number[] = [];
  for (let i = 0; i < trials; i += 1) {
    await sleep(Math.floor(Math.random() * 4000));
    const id = await seed(true, false);
    const t0 = performance.now();
    while ((await status(id)) === "accepted") {
      await sleep(25);
      if (performance.now() - t0 > 120_000) throw new Error("the container did not find the stuck order in 120 s");
    }
    times.push(performance.now() - t0);
  }
  return { min: Math.round(Math.min(...times)), p50: Math.round(pct(times, 50)), max: Math.round(Math.max(...times)), all: times.map(Math.round) };
}

// 1. active cadence: an order is already open, so the container ticks every 5 s
await seed(false, true);
const active = await run("bullpen-sweeper-active", {}, 8);
log(`stuck order, container at the 5 s cadence: ${JSON.stringify(active)}`);

// 2. SIGTERM: `docker stop` sends SIGTERM and waits the 30 s grace before SIGKILL
const t0 = performance.now();
execFileSync("docker", ["stop", "-t", "30", "bullpen-sweeper-active"], { stdio: "ignore" });
const stopMs = Math.round(performance.now() - t0);
const exit = execFileSync("docker", ["inspect", "-f", "{{.State.ExitCode}}", "bullpen-sweeper-active"], { encoding: "utf8" }).trim();
const logTail = execFileSync("docker", ["logs", "--tail", "2", "bullpen-sweeper-active"], { encoding: "utf8" }).trim().split("\n");
log(`docker stop (SIGTERM, 30 s grace): stopped in ${stopMs} ms, exit code ${exit}; last log line: ${logTail[logTail.length - 1]!.replace(secret, "<token>")}`);

// 3. idle backoff: with nothing open the waits double up to the ceiling, so a stuck order that appears then is found within that ceiling.
// The ceiling is 30 s here (60 minutes in production) so the run is short. Each trial empties the tables and waits for the backoff to reach it.
const clear = (): Promise<unknown> => trading.query("TRUNCATE trading.order_events, trading.fills, trading.reservations, trading.ledger, trading.positions, trading.orders, trading.accounts CASCADE");
await clear();
execFileSync("docker", ["rm", "-f", "bullpen-sweeper-idle"], { stdio: "ignore" });
execFileSync("docker", ["run", "-d", "--name", "bullpen-sweeper-idle", "--add-host=host.docker.internal:host-gateway", "-e", "SWEEPER_TARGET_URL=http://host.docker.internal:3198/api/internal/sweep", "-e", `SWEEPER_TOKEN=${secret}`, "-e", "SWEEPER_ACTIVE_MS=2000", "-e", "SWEEPER_MAX_MS=30000", image], { stdio: "ignore" });
const idleTimes: number[] = [];
for (let i = 0; i < 3; i += 1) {
  await clear();
  await sleep(50_000); // 4, 8, 16, 30, 30 ... seconds between calls: well into the ceiling
  const id = await seed(true, false);
  const start = performance.now();
  while ((await status(id)) === "accepted") {
    await sleep(100);
    if (performance.now() - start > 120_000) throw new Error("the idle container did not find the stuck order in 120 s");
  }
  idleTimes.push(Math.round(performance.now() - start));
}
log(`stuck order, container idle (ceiling 30 s, accelerated; production's is 60 minutes), ms to be found: ${JSON.stringify(idleTimes)}`);

execFileSync("docker", ["rm", "-f", "bullpen-sweeper-idle", "bullpen-sweeper-active"], { stdio: "ignore" });
process.kill(-web.pid!, "SIGTERM"); // the whole group: `pnpm exec` and the server it starts
await trading.end();
await marketData.end();
await teardown();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sweeper-docker-output.txt"), `${lines.join("\n")}\n`);
process.exit(0);
