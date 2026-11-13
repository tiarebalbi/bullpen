# Load tests (Part 5)

k6 scenarios and the local stack they run against. **Open model only**: every scenario is `constant-arrival-rate` or `ramping-arrival-rate`, so a slow server cannot slow the
arrivals (a closed loop would, and would hide the overload). Thresholds sit on `dropped_iterations`, the error rate and p95; goodput (answers in time, not 5xx) is a counter.

## Where each one runs, and how far its numbers reach

| Test | Where | What it shows |
|---|---|---|
| The 9:30 step, polling, SSE fan-out, leaderboard, isolation, stress | `scripts/load-all.sh`: k6 and a stand-in Trading App on this machine, against a local Postgres | Application capacity under simulated constraints. **Not** Next.js, sign-in or Vercel's limits. The stand-in shares the pools, the lifecycle, the sweep, the price hub and the stream with the deployed routes. |
| Database pressure | A Neon branch the owner creates and hands over | Controlled. Not run until that exists. |
| Integrated deployment test | `cloud.js` against a Vercel Hobby preview, bounded | Deployed behaviour at small scale. Never proof of 1,000 simultaneous hosted users. |

## Local

```bash
pg_createcluster 16 load -p 5433 --start      # a throwaway cluster; never the shared test one
export K6=/path/to/k6 TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
cd architecture/fitness && bash scripts/load-all.sh
```

`src/load/throttle.ts` holds the cluster to a fraction of one core (SIGSTOP/SIGCONT on a 20 ms duty cycle) for the `-db0.25` runs: an approximation of 0.25 CU, with the caveats in its header.
Every run writes `post-facts/part-05-runs/<label>.json`. `src/load/multixact.ts` and `src/load/sse-cut.ts` are the two single-purpose runs (the Part 4 error under load; the 300 s cut on a real connection).

## Cloud runs: abort thresholds

Never production. On Hobby, going over a limit pauses the live app. A cloud run stops on the first of these:

| Limit | Stop at | Who watches |
|---|---|---|
| p95 latency | over 2 s (after 15 s) | k6 (`abortOnFail`) |
| 5xx or unanswered rate | over 2 % (after 15 s) | k6 (`abortOnFail`) |
| Arrivals k6 had no VU for | 20 | k6 (`abortOnFail`) |
| Function usage | 25 % of any Hobby monthly allowance spent by one run (Active CPU 1 h of 4 h; provisioned memory 90 GB-h of 360) | the Vercel usage page, read before and during; stop by hand |
| Concurrent executions | 400 (40 % of 1,000 per 10 s) | the Vercel observability page; stop by hand |
| Database connections | 80 (about 80 % of the pooler's 0.9 x 112 at 0.25 CU) | the Neon console's monitoring; stop by hand |

k6 cannot see the last three. `cloud.js` offers 5 requests/s of reads, 1 order/s and at most 5 new streams/s for 60 s; raise those only after the first run stayed far from every limit.
