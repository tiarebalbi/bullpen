import { realSleep, run } from "./ticker.ts";

const url = process.env.SWEEPER_TARGET_URL;
const token = process.env.SWEEPER_TOKEN;
const controller = new AbortController();
// Optional: shorter waits for a test or a measurement. Left unset, the defaults of the ticker apply (5 s, 60 min).
const intOf = (name: string): number | undefined => (/^\d+$/.test(process.env[name] ?? "") ? Number(process.env[name]) : undefined);

// Vercel sends SIGTERM on every rollout and waits (30 s by default). Abandon the call in flight and leave: the route is idempotent.
process.on("SIGTERM", () => controller.abort());
process.on("SIGINT", () => controller.abort());

if (!url || !token) {
  // Misconfigured: say so once and wait. Exiting would make Vercel restart the daemon in a loop that spends the quota.
  console.log(JSON.stringify({ at: new Date().toISOString(), outcome: "not-configured", problem: "SWEEPER_TARGET_URL or SWEEPER_TOKEN is not set; waiting" }));
  while (!controller.signal.aborted) await realSleep(60_000, controller.signal);
} else {
  console.log(JSON.stringify({ at: new Date().toISOString(), outcome: "started", target: new URL(url).origin }));
  await run({ url, token, activeMs: intOf("SWEEPER_ACTIVE_MS"), maxMs: intOf("SWEEPER_MAX_MS") }, controller.signal);
}
console.log(JSON.stringify({ at: new Date().toISOString(), outcome: "stopped" }));
process.exit(0);
