// A bounded check of DEPLOYED behaviour on a Vercel Hobby preview, against a Neon branch the owner created for it. Never production, and never a claim about 1,000 users:
// the arrival rates below are small on purpose, and the report says what was offered and what was measured, nothing more.
//
//   k6 run -e BASE=https://<preview>.vercel.app -e ALLOW_REMOTE=preview-or-branch-only -e STACK=<stack.json> -e BYPASS=<preview protection bypass token> cloud.js
//
// Abort thresholds (every one stops the run, k6 exits non-zero, and the summary says which fired). k6 can see latency and errors; it cannot see Vercel's function usage,
// concurrency or the database's connections: those are watched on the dashboards, and the run is stopped by hand (Ctrl-C) at the first of the limits in README.md.
import http from "k6/http";
import { check } from "k6";
import { BASE, headers, pick, who, symbols } from "./lib.js";

const cap = (name, fallback) => Number(__ENV[name] || fallback);
const bypass = __ENV.BYPASS ? { "x-vercel-protection-bypass": __ENV.BYPASS } : {};

export const options = {
  scenarios: {
    polls: { executor: "constant-arrival-rate", rate: cap("POLL_RATE", 5), timeUnit: "1s", duration: `${cap("SECONDS", 60)}s`, preAllocatedVUs: 10, maxVUs: 40, exec: "poll" },
    orders: { executor: "constant-arrival-rate", rate: cap("ORDER_RATE", 1), timeUnit: "1s", duration: `${cap("SECONDS", 60)}s`, preAllocatedVUs: 5, maxVUs: 20, exec: "order" },
    streams: { executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1s", stages: [{ target: cap("STREAMS", 5), duration: "20s" }, { target: cap("STREAMS", 5), duration: "40s" }], preAllocatedVUs: 20, maxVUs: 60, exec: "stream", gracefulStop: "30s" },
  },
  thresholds: {
    // p95 latency over 2 s for the whole run, evaluated after the first 15 s so a cold start does not stop it on its own.
    http_req_duration: [{ threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "15s" }],
    // More than 2 % of requests answered with a server error, or not answered.
    http_req_failed: [{ threshold: "rate<0.02", abortOnFail: true, delayAbortEval: "15s" }],
    // k6 had no VU for an arrival: the offered load is no longer what was planned.
    dropped_iterations: [{ threshold: "count<20", abortOnFail: true }],
  },
};

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 422));
const withBypass = (extra = {}) => ({ headers: { ...bypass, ...extra.headers }, tags: extra.tags });

export function poll() {
  check(http.get(`${BASE}/api/stock-prices`, withBypass()), { "prices answered": (r) => r.status === 200 });
}
export function order() {
  // A preview signs players in with GitHub, so an order needs a session cookie the owner supplies for a test account; without one the route answers 401 and this checks that it does.
  const res = http.post(`${BASE}/api/orders`, JSON.stringify({ symbol: pick(symbols), quantity: "1", clientOrderId: `cloud-${__VU}-${__ITER}-${Date.now()}` }), withBypass({ headers: { "content-type": "application/json", ...(__ENV.COOKIE ? { cookie: __ENV.COOKIE } : {}) } }));
  check(res, { "an order is answered, not dropped": (r) => [200, 201, 401, 422].includes(r.status) });
}
export function stream() {
  const res = http.get(`${BASE}/api/prices/stream`, { ...withBypass(), timeout: "45s", tags: { kind: "sse" } });
  check(res, { "stream answered": (r) => r.status === 200 || r.status === 0 });
}
void headers;
void who;
