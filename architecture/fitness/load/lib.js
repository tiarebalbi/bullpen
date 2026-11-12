// Shared by every k6 scenario. Open-model only: scenarios are constant-arrival-rate or ramping-arrival-rate (see scenarios.js), never a fixed number of looping VUs.
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

export const BASE = __ENV.BASE || "http://127.0.0.1:3100";
// A load run is local. Anything else is a deliberate, named choice, and never production: the guard reads the host before a single request is made.
const host = BASE.replace(/^https?:\/\//, "").split(/[/:]/)[0];
if (host !== "127.0.0.1" && host !== "localhost" && __ENV.ALLOW_REMOTE !== "preview-or-branch-only") {
  throw new Error(`refusing to run a load against ${host}: set ALLOW_REMOTE=preview-or-branch-only for a Vercel preview or a Neon branch, never production`);
}

const stack = new SharedArray("stack", () => [JSON.parse(open(__ENV.STACK))]);
export const accounts = stack[0].accounts;
export const symbols = stack[0].symbols;

/** Requests answered in time and not with a server error: goodput counts these, not every request sent. */
export const SLO_MS = Number(__ENV.SLO_MS || 1000);
export const goodput = new Counter("goodput");
export const orderLatency = new Trend("order_latency", true);

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const who = () => accounts[Math.floor(Math.random() * accounts.length)];
export const headers = (account) => ({ "x-account": account, "content-type": "application/json" });

// 200, 201 and 202 are answers; 422 is a safe refusal (stale price, no buying power) and is an answer too. Only 5xx and no answer are failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 422));

export function served(res, tags) {
  const ok = res.status > 0 && res.status < 500 && res.timings.duration <= SLO_MS;
  if (ok) goodput.add(1, tags);
  return ok;
}

export function placeOrder(phase) {
  const account = who();
  const tags = { kind: "order", phase };
  const res = http.post(`${BASE}/api/orders`, JSON.stringify({ symbol: pick(symbols), quantity: "1", clientOrderId: `k6-${__VU}-${__ITER}-${Date.now()}-${Math.random()}` }), { headers: headers(account), tags });
  orderLatency.add(res.timings.duration, tags);
  served(res, tags);
  return res;
}
export function pollAccount(phase) {
  const tags = { kind: "account", phase };
  const res = http.get(`${BASE}/api/orders`, { headers: headers(who()), tags });
  served(res, tags);
  return res;
}
export function pollLeaderboard(phase) {
  const tags = { kind: "leaderboard", phase };
  const res = http.get(`${BASE}/api/leaderboard`, { tags });
  served(res, tags);
  return res;
}
export function pollPrices(phase) {
  const tags = { kind: "prices", phase };
  const res = http.get(`${BASE}/api/stock-prices`, { tags });
  served(res, tags);
  return res;
}
export function saveHandle(phase) {
  const tags = { kind: "handle", phase };
  const res = http.post(`${BASE}/api/handle`, JSON.stringify({ handle: `Bull${Math.floor(Math.random() * 1e6)}` }), { headers: headers(who()), tags });
  served(res, tags);
  return res;
}
export function control(body) {
  return http.post(`${BASE}/__control`, JSON.stringify(body), { tags: { kind: "control" } });
}
export function stats() {
  return http.get(`${BASE}/__stats`, { tags: { kind: "stats" } }).json();
}
