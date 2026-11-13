/**
 * An attempt to reproduce, under load, the Postgres error Part 4 saw once in CI: "new multixact has more than one updating member" (post-facts of Part 4, section 15).
 * It runs the lifecycle's steps against the same orders from many connections at once: duplicate fills, a cancel and its confirmation, a release, an admission and a
 * second admission, all racing, on a small set of contended accounts, for a fixed time. It counts every error by its code and message and says whether the multixact
 * one appeared. It is a local run on the Postgres this machine has, which is not the Postgres 17 that CI used when it saw the error, and it says so in its result.
 *
 *   TEST_DATABASE_URL=<local admin url> tsx src/load/multixact.ts [seconds=180] [concurrency=60] [accounts=20]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { admitQueuedOrder, bookFill, confirmCancel, createPool, markWorking, releaseReservation, requestCancel, submitOrder, CrashError } from "@bullpen/db-trading";
import { assertLocal, buildStack } from "./stack.js";

const [secondsText = "180", concurrencyText = "60", accountsText = "20"] = process.argv.slice(2);
const seconds = Number(secondsText);
const concurrency = Number(concurrencyText);
const adminUrl = process.env.TEST_DATABASE_URL ?? "";
assertLocal(adminUrl);
process.env.TEST_DATABASE_NAME = "bullpen_multixact";

const stack = await buildStack(adminUrl, Number(accountsText), 4);
const pool = createPool(stack.urls.tradingOwner, { max: Math.min(100, concurrency + 10) });
const version = (await pool.query<{ v: string }>("SHOW server_version")).rows[0]!.v;

const SATURDAY = new Date("2026-11-14T15:00:00Z");
const errors = new Map<string, number>();
let iterations = 0;
let operations = 0;
let multixact = 0;
const note = (error: unknown): void => {
  if (error instanceof CrashError) return;
  const e = error as { code?: string; message?: string };
  const key = `${e.code ?? "?"} ${String(e.message ?? error).slice(0, 120)}`;
  errors.set(key, (errors.get(key) ?? 0) + 1);
  if (/multixact/i.test(String(e.message))) multixact += 1;
};

async function life(n: number): Promise<void> {
  const account = stack.accounts[n % stack.accounts.length]!;
  const symbol = stack.symbols[n % stack.symbols.length]!;
  const queued = n % 2 === 0;
  let submitted;
  try {
    submitted = await submitOrder(pool, { accountId: account, symbol, quantity: "4", clientOrderId: `mx-${n}-${Date.now()}` }, {}, queued ? { marketHoursAt: SATURDAY } : {});
  } catch (error) {
    note(error);
    return;
  }
  const orderId = submitted.orderId;
  if (!queued) await markWorking(pool, orderId).catch(note);
  const now = new Date();
  const open = () => true;
  const fill = (id: string, quantity: string) => bookFill(pool, { fillId: `${orderId}:${id}`, orderId, quantity, price: "50", executedAt: now });
  // Everything at once, on the same order and the same account.
  const ops: Promise<unknown>[] = [
    admitQueuedOrder(pool, orderId, now, {}, open),
    admitQueuedOrder(pool, orderId, now, {}, open),
    fill("0", "2"),
    fill("0", "2"), // a duplicate delivery
    fill("1", "2"),
    requestCancel(pool, orderId, now),
    confirmCancel(pool, orderId, new Date(now.getTime() + 5)),
    releaseReservation(pool, orderId, new Date(now.getTime() + 60_000)),
  ];
  operations += ops.length;
  for (const result of await Promise.allSettled(ops)) if (result.status === "rejected") note(result.reason);
  iterations += 1;
}

const deadline = Date.now() + seconds * 1000;
let counter = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadline) await life(counter++);
  }),
);

const problems = await pool.query("SELECT count(*)::int AS n FROM trading.orders WHERE filled_qty + open_qty + cancelled_qty <> quantity");
const negative = await pool.query("SELECT count(*)::int AS n FROM trading.accounts WHERE buying_power < 0");
const result = {
  at: new Date().toISOString(),
  postgres: version,
  note: "Local Postgres, not the Postgres 17 CI used when the error was seen once. Not reproducing here does not show the error cannot happen there.",
  seconds,
  concurrency,
  contendedAccounts: stack.accounts.length,
  lives: iterations,
  operations,
  multixactErrors: multixact,
  errorsByKind: Object.fromEntries([...errors.entries()].sort((a, b) => b[1] - a[1])),
  quantityViolations: problems.rows[0].n,
  negativeBuyingPower: negative.rows[0].n,
};
mkdirSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "post-facts", "part-05-runs"), { recursive: true });
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "post-facts", "part-05-runs", "multixact.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await pool.end();
void pg;
