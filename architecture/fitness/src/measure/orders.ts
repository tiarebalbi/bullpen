/**
 * What a player's order costs, measured on a throwaway local Postgres (never Neon, so it moves no Neon transfer; every row is a test row).
 *
 *   measured - for one market buy placed and polled until it is filled, the way the screens do it: the SQL statements the app sends, the rows
 *              written (Postgres's own counters) and the WAL bytes; how many polls the order needs; and the size of the account response a
 *              polling subscriber receives (JSON and gzip) for 0, 1, 7 and 50 orders.
 *   computed - bytes per hour and per month for one subscriber at the screens' cadence (3 s while an order is open, 15 s otherwise).
 *   NOT measured here - Neon's CU-hours and network transfer, and Vercel's function invocations and Active CPU as billed: those need the
 *              dashboards, which were not read. The invocations are counted (one POST, one GET a poll), not billed.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import pg from "pg";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { createPool, ensurePlayerAccount, placePlayerOrder, advanceAccount, readAccountView, type AccountView } from "@bullpen/db-trading";
import { validateAccountView } from "@bullpen/contracts";
import setup, { type DbUrls } from "../db-integration/global-setup.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.PART4_REPORT_DIR ?? join(here, "..", "..", "..", "..", "architecture", "reports", "part-04", "raw");
const admin = process.env.TEST_DATABASE_URL ?? "";
if (!/^postgres:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(admin)) throw new Error("This script runs only against a local Postgres (TEST_DATABASE_URL on 127.0.0.1). Use db:measure-orders.");

const ORDERS = 40;
const OPEN_POLL_S = 3;
const IDLE_POLL_S = 15;
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let urls!: DbUrls;
const teardown = await setup({ provide: (_key, value) => void (urls = value) });

// Count every statement the app's code sends: each pool connection is a pg.Client.
let statements = 0;
const original = pg.Client.prototype.query as (...args: unknown[]) => unknown;
(pg.Client.prototype as { query: unknown }).query = function (this: pg.Client, ...args: unknown[]) {
  statements += 1;
  return original.apply(this, args);
};

const trading = createPool(urls.tradingOwner, 4);
const marketData = createMarketDataPool(urls.marketDataOwner);

async function rowsWritten(): Promise<number> {
  await trading.query("SELECT pg_stat_clear_snapshot()");
  const { rows } = await trading.query<{ n: string }>("SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::text AS n FROM pg_stat_user_tables WHERE schemaname = 'trading'");
  return Number(rows[0]!.n);
}
async function wal(): Promise<number> {
  const { rows } = await trading.query<{ n: string }>("SELECT pg_current_wal_lsn() - '0/0'::pg_lsn AS n");
  return Number(rows[0]!.n);
}

const account = await ensurePlayerAccount(trading, `measure-${randomUUID()}`);
const symbol = "MEAS";
await marketData.query("INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until) VALUES ($1, now(), '100', 'test', now() + interval '1 hour')", [symbol]);

// ---- one order, placed and polled until filled -----------------------------------------------------------------------
const perOrder: { statements: number; rows: number; walBytes: number; polls: number; postStatements: number }[] = [];
for (let i = 0; i < ORDERS; i += 1) {
  await sleep(1300); // Postgres flushes its counters about once a second
  const [rowsBefore, walBefore] = [await rowsWritten(), await wal()];
  statements = 0;
  await placePlayerOrder(trading, account.accountId, { symbol, quantity: "10", clientOrderId: randomUUID() });
  const postStatements = statements;
  let polls = 0;
  // The POST already advances the player's orders, so an order can be filled when it returns: then the screen needs no poll for it.
  for (let state = (await readAccountView(trading, account.accountId))!.orders[0]!.state; state !== "filled" && polls < 50; polls += 1) {
    await advanceAccount(trading, account.accountId);
    const view = (await readAccountView(trading, account.accountId))!;
    state = view.orders[0]!.state;
  }
  const used = statements;
  await sleep(1300);
  perOrder.push({ statements: used, postStatements, rows: (await rowsWritten()) - rowsBefore, walBytes: (await wal()) - walBefore, polls });
}
const mean = (key: keyof (typeof perOrder)[number]): number => round(perOrder.reduce((s, o) => s + o[key], 0) / perOrder.length);

// ---- a poll with nothing open: the statements the idle subscriber costs -------------------------------------------------
statements = 0;
await advanceAccount(trading, account.accountId);
await readAccountView(trading, account.accountId);
const idlePollStatements = statements;

// ---- the response a polling subscriber receives -------------------------------------------------------------------------
const sizes: { orders: number; jsonBytes: number; gzipBytes: number; valid: boolean }[] = [];
for (const count of [0, 1, 7, 50]) {
  const holder = await ensurePlayerAccount(trading, `measure-size-${randomUUID()}`);
  for (let i = 0; i < count; i += 1) await placePlayerOrder(trading, holder.accountId, { symbol, quantity: "1", clientOrderId: randomUUID() });
  const view = (await readAccountView(trading, holder.accountId)) as AccountView;
  const body = JSON.stringify(view);
  sizes.push({ orders: view.orders.length, jsonBytes: Buffer.byteLength(body), gzipBytes: gzipSync(body).length, valid: validateAccountView(JSON.parse(body)).valid });
}

const perHour = (bytes: number, seconds: number): number => Math.round((bytes * 3600) / seconds);
const subscriber = sizes.map((s) => ({ ...s, gzipBytesPerHourWhileOpen: perHour(s.gzipBytes, OPEN_POLL_S), gzipBytesPerHourIdle: perHour(s.gzipBytes, IDLE_POLL_S) }));

const result = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  database: "throwaway local Postgres 17 container; no Neon",
  orders: ORDERS,
  perOrder: {
    statementsPlacingAndPollingToFilled: mean("statements"),
    statementsInThePost: mean("postStatements"),
    rowsWritten: mean("rows"),
    walBytes: mean("walBytes"),
    pollsToFilled: mean("polls"),
    pollsToFilledDistribution: Object.fromEntries([...new Set(perOrder.map((o) => o.polls))].sort().map((p) => [p, perOrder.filter((o) => o.polls === p).length])),
    functionInvocations: round(1 + mean("polls")),
  },
  idlePollStatements,
  subscriber,
  note: "Rows written and WAL bytes are Postgres counters on the throwaway database. Function invocations are counted (1 POST + 1 GET per poll), not billed. Neon CU-hours and transfer, and Vercel Active CPU as billed, are pending: the dashboards were not read.",
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "orders-measure.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await trading.end();
await marketData.end();
await teardown();
