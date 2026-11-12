// k6 scenarios for Part 5. Open model only: every executor is constant-arrival-rate or ramping-arrival-rate, so a slow server cannot slow the arrivals down
// (that is what a closed loop of virtual users would do, and it would hide the overload this part is about). Thresholds sit on dropped_iterations (an arrival
// k6 had no VU for: the load the test could not even offer), the error rate and p95. Goodput (answers in time, not 5xx) is a counter reported beside them.
//
//   k6 run -e STACK=<stack.json> -e SCENARIO=<name> [-e SUMMARY=<out.json>] scenarios.js
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { BASE, SLO_MS, accounts, control, headers, pick, placeOrder, pollAccount, pollLeaderboard, pollPrices, saveHandle, symbols } from "./lib.js";

const SCENARIO = __ENV.SCENARIO || "step";
const num = (name, fallback) => Number(__ENV[name] || fallback);

const constant = (rate, duration, execName, extra = {}) => ({ executor: "constant-arrival-rate", rate, timeUnit: "1s", duration, preAllocatedVUs: Math.max(20, Math.ceil(rate / 4)), maxVUs: Math.max(100, rate * 2), exec: execName, ...extra });
const ramping = (stages, execName, extra = {}) => ({ executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1s", stages, preAllocatedVUs: 200, maxVUs: 1500, exec: execName, ...extra });

/** Always hold; they exist so that k6 reports each kind of request on its own in the summary. */
const SEEN = ["account", "leaderboard", "prices", "sse", "order", "handle"].reduce((all, kind) => ({ ...all, [`http_req_duration{kind:${kind}}`]: [{ threshold: "p(95)>=0", abortOnFail: false }], [`http_req_failed{kind:${kind}}`]: [{ threshold: "rate>=0", abortOnFail: false }] }), {});
const THRESHOLDS = {
  ...SEEN,
  dropped_iterations: [{ threshold: "count<10", abortOnFail: false }],
  "http_req_failed{kind:order}": [{ threshold: "rate<0.01", abortOnFail: false }],
  "http_req_failed{kind:account}": [{ threshold: "rate<0.01", abortOnFail: false }],
  "http_req_duration{kind:order}": [{ threshold: "p(95)<1000", abortOnFail: false }],
  "http_req_duration{kind:account}": [{ threshold: "p(95)<1000", abortOnFail: false }],
};

// ---- the 9:30 step: the queued backlog is released, new orders arrive, every screen polls -------------------------------------------------------------------
function step() {
  const orders = num("R_ORDERS", 150);
  const duration = __ENV.DURATION || "60s";
  const startTime = __ENV.START_AFTER || "0s";
  return {
    orders_step: ramping([{ target: orders, duration: "1s" }, { target: orders, duration }], "newOrder", { startTime }),
    screens: constant(num("R_ACCOUNT", 333), duration, "screen", { startTime }),
    board: constant(num("R_BOARD", 17), duration, "board", { startTime }),
  };
}
// ---- the backlog: 1,000 players each place one order while the market is closed, so each is queued for the open ----------------------------------------------
function queue() {
  return { queue: { executor: "shared-iterations", vus: 100, iterations: accounts.length, maxDuration: "120s", exec: "queueOne" } };
}
// ---- the polling stampede: every open screen -----------------------------------------------------------------------------------------------------------------
function polling() {
  const screens = num("SCREENS", 1000);
  const accountEvery = num("ACCOUNT_S", 3);
  const pricesEvery = __ENV.VARIANT === "old" ? 300 : 10;
  const ramp = (rate) => ramping([{ target: rate, duration: "20s" }, { target: rate, duration: __ENV.DURATION || "60s" }], "");
  return {
    accounts: { ...ramp(Math.round(screens / accountEvery)), exec: "screen" },
    board: { ...ramp(Math.max(1, Math.round(screens / 60))), exec: "board" },
    prices: { ...ramp(Math.max(1, Math.round(screens / pricesEvery))), exec: "prices" },
  };
}
// ---- SSE fan-out: connections held open, increasing concurrency ----------------------------------------------------------------------------------------
function sse() {
  const lifetime = num("LIFE_S", 30);
  const top = num("CONNECTIONS", 1000);
  const rate = (concurrency) => Math.max(1, Math.round(concurrency / lifetime));
  return {
    sse_open: ramping(
      [
        { target: rate(top / 4), duration: "15s" },
        { target: rate(top / 2), duration: "15s" },
        { target: rate(top), duration: "20s" },
        { target: rate(top), duration: `${lifetime + 20}s` },
      ],
      "sseOpen",
      { preAllocatedVUs: top + 100, maxVUs: top + 400, gracefulStop: "60s" },
    ),
  };
}
// ---- the leaderboard stampede ----------------------------------------------------------------------------------------------------------------------------------
function leaderboard() {
  const top = num("R_BOARD_TOP", 2000);
  return { board: ramping([{ target: Math.round(top / 4), duration: "10s" }, { target: Math.round(top / 2), duration: "10s" }, { target: top, duration: "10s" }, { target: top, duration: __ENV.DURATION || "40s" }], "board", { preAllocatedVUs: 300, maxVUs: 2500 }) };
}
// ---- the stress run: a steady mixed load, one phase after another, while the orchestrator breaks something in each phase ---------------------------------------
const PHASES = ["baseline", "feed-down", "quota-exhausted", "moderation-down", "leaderboard-stampede", "cold-database", "recovery"];
const PHASE_S = num("PHASE_S", 40);
function stress() {
  const out = {};
  const rate = num("MIX_RATE", 300);
  PHASES.forEach((phase, i) => {
    out[`mixed_${phase.replace(/-/g, "_")}`] = constant(rate, `${PHASE_S}s`, `mixed_${phase.replace(/-/g, "_")}`, { startTime: `${i * PHASE_S}s`, tags: { phase } });
  });
  out.stampede = constant(num("STAMPEDE_RATE", 1500), `${PHASE_S}s`, "stampedeBoard", { startTime: `${PHASES.indexOf("leaderboard-stampede") * PHASE_S}s`, tags: { phase: "leaderboard-stampede" } });
  return out;
}

// ---- read/write isolation: the same orders, alone and then with a read stampede beside them ------------------------------------------------------------------
function isolation() {
  const reads = num("READ_RATE", 1800);
  const orders = num("R_ORDERS", 100);
  return {
    orders_alone: constant(orders, "30s", "isoOrder", { tags: { phase: "alone" }, env: { PHASE: "alone" } }),
    orders_with_reads: constant(orders, "30s", "isoOrder", { startTime: "35s", tags: { phase: "stampede" }, env: { PHASE: "stampede" } }),
    reads: constant(reads, "30s", "isoReads", { startTime: "35s", tags: { phase: "stampede-reads" }, env: { PHASE: "stampede-reads" } }),
  };
}

const SETS = { step, queue, polling, sse, leaderboard, stress, isolation };

/** k6 reports a tagged sub-metric in the summary only if a threshold names it; these always hold and exist to make it appear. */
function track(metric, tags, rule) {
  return { [`${metric}{${tags}}`]: [{ threshold: rule, abortOnFail: false }] };
}
function perPhase() {
  const phases = SCENARIO === "stress" ? PHASES : ["alone", "stampede", "stampede-reads"];
  let out = {};
  for (const phase of phases) {
    for (const kind of ["order", "account", "prices", "leaderboard"]) {
      out = { ...out, ...track("http_req_duration", `kind:${kind},phase:${phase}`, "p(95)>=0"), ...track("http_req_failed", `kind:${kind},phase:${phase}`, "rate>=0") };
    }
    out = { ...out, ...track("goodput", `phase:${phase}`, "count>=0") };
  }
  return out;
}
export const options = {
  scenarios: SETS[SCENARIO](),
  thresholds: SCENARIO === "queue" ? {} : { ...THRESHOLDS, ...(SCENARIO === "stress" || SCENARIO === "isolation" ? perPhase() : {}) },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  discardResponseBodies: false,
};

export function setup() {
  if (SCENARIO === "queue") control({ market: "closed" });
  if (SCENARIO === "leaderboard" && __ENV.REFRESH === "off") control({ off: "leaderboard-refresh" });
  return {};
}

// ---- iteration functions -----------------------------------------------------------------------------------------------------------------------------------------
export function newOrder() { placeOrder("step"); }
export function screen() { pollAccount(__ENV.PHASE || SCENARIO); }
export function board() { pollLeaderboard(__ENV.PHASE || SCENARIO); }
export function prices() { pollPrices(__ENV.PHASE || SCENARIO); }
export function isoOrder() { placeOrder(__ENV.PHASE || "iso"); }
export function isoReads() {
  const roll = Math.random();
  if (roll < 0.4) pollLeaderboard("stampede-reads");
  else if (roll < 0.8) pollAccount("stampede-reads");
  else pollPrices("stampede-reads");
}
export function stampedeBoard() { pollLeaderboard("leaderboard-stampede"); }
export function queueOne() {
  const account = accounts[exec.scenario.iterationInTest % accounts.length];
  const res = http.post(`${BASE}/api/orders`, JSON.stringify({ symbol: pick(symbols), quantity: "1", clientOrderId: `queued-${exec.scenario.iterationInTest}` }), { headers: headers(account), tags: { kind: "order", phase: "queue" } });
  check(res, { "queued": (r) => r.status === 201 });
}
export function sseOpen() {
  const res = http.get(`${BASE}/api/prices/stream?lifetime=${num("LIFE_S", 30) * 1000}`, { timeout: `${num("LIFE_S", 30) + 30}s`, tags: { kind: "sse", phase: "sse" } });
  check(res, { "stream carried prices": (r) => r.status === 200 && r.body.includes("event: prices"), "stream ended with bye": (r) => r.body.includes("event: bye") });
}

function mixed(phase) {
  const roll = Math.random();
  if (roll < 0.05) placeOrder(phase);
  else if (roll < 0.65) pollAccount(phase);
  else if (roll < 0.73) pollLeaderboard(phase);
  else if (roll < 0.93) pollPrices(phase);
  else saveHandle(phase);
}
export function mixed_baseline() { mixed("baseline"); }
export function mixed_feed_down() { mixed("feed-down"); }
export function mixed_quota_exhausted() { mixed("quota-exhausted"); }
export function mixed_moderation_down() { mixed("moderation-down"); }
export function mixed_leaderboard_stampede() { mixed("leaderboard-stampede"); }
export function mixed_cold_database() { mixed("cold-database"); }
export function mixed_recovery() { mixed("recovery"); }

export function handleSummary(data) {
  const out = __ENV.SUMMARY;
  const picked = {};
  for (const [name, metric] of Object.entries(data.metrics)) picked[name] = { type: metric.type, values: metric.values, thresholds: metric.thresholds };
  const result = { scenario: SCENARIO, sloMs: SLO_MS, state: data.state, metrics: picked, root: data.root_group ? undefined : undefined };
  return out ? { [out]: JSON.stringify(result, null, 1) } : {};
}
