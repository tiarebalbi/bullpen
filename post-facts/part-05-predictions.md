# Part 5 predictions: written before any load test runs

Written on 2026-11-12. The commit that adds this file is the proof of when it was written; no k6 run, no queued-order code and no
measurement existed when it was committed. Part 5's report (`post-facts/part-05.md`) grades each line below against what was measured.
Numbers here are estimates from the known limits, not measurements; where I do not know, I say so.

## Inputs (limits as recorded in `cost/allowances.json` and the brief)

- Vercel: 1,000 concurrent executions per 10 s, then 503. 1,024 file descriptors per instance. Hobby function duration cap 300 s.
- Neon at 0.25 CU: 112 `max_connections`; the pooler (transaction mode) serves 0.9 x 112 = about 100 server connections.
- Little's Law: L = lambda x W (requests in flight = arrival rate x time in the system).
- Assumed service times, to be replaced by measurements: order POST 80 ms (one transaction, a few statements); price/account poll 25 ms; leaderboard read 15 ms (materialized view).
- The simulated crowd: 1,000 players, each with one open screen polling prices, account and leaderboard every 5 s, and about 3 in 4 placing one order within the first 10 s of the open.

## Part 1's two promises

1. **"One deployment can serve 1,000 players within the free tiers."** Prediction: **yes for the work, with a caveat on how it is served.**
   The requests fit (1,000 players polling every 5 s is 600 req/s of cheap reads, well under any hard limit I know), but Active CPU is the allowance that decides:
   4 h/month. At 600 req/s and 25 ms of CPU each, an hour of that crowd spends 15 CPU-s per second of wall time, so about 4 h of CPU in 16 minutes of a full crowd.
   So 1,000 players are served within the tiers only if they are not all connected for long: the market open is fine, a trading day of polling is not.
   Streaming (SSE) should cut it, because one read per instance replaces one read per viewer. I expect the answer to be **yes for a burst, no for a day of constant polling**, and I expect the report to have to say so.
2. **"A dead market-data feed cannot stop order entry."** Prediction: **yes.** Order entry reads prices from `market_data.prices_v1` (the stored contract) and never calls a provider, so a dead feed makes prices go stale, and the stale rule (ADR-0024) refuses *that symbol's* order with `stale-price`, a safe refusal. It does not stop entry for other symbols or for queued orders, which already carry their own ceiling. I expect no path where a provider outage blocks the order route itself.

## The week-one Part 5 model (`architecture/calm/planned/part-05`, tag `predictions-week-1`)

- **Market Open Queue (Vercel Queues or equivalent): not needed.** The Postgres state machine (ADR-0017) already persists the order before any work happens, so the "queue" is a state (`queued_for_open`) plus a sweeper that admits orders in batches. A separate queue would be a second place for the same order to live.
- **Order Saga workflow engine: not needed.** ADR-0017 already decided that the saga is a set of conditional transactions, not a new service. Part 5 adds a state, not an engine.
- What the week-one model got right: the *burst needs somewhere to wait*. What it got wrong: it assumed the waiting place had to be a new service. I expect the report to say the wait lives in Postgres.

## What breaks first at the 9:30 step, and at what rate

- Vercel's limit: if every request is held for W, the concurrency cap is reached at lambda = 1,000 / W. Read as "1,000 in flight": at 80 ms per order that is 12,500 orders/s, far above 1,000 players; read as "1,000 invocations per 10 s window": that is 100 req/s sustained, which **the 9:30 burst would exceed** (1,000 orders in 10 s plus 600 req/s of polling).
  I do not know which reading Vercel applies; the Hobby run is what will tell me, and the abort thresholds stop it before it matters.
- File descriptors: each in-flight request and each open SSE stream holds a socket. At about 1,024 per instance, minus database sockets and runtime files, **an instance should refuse new connections at roughly 900 concurrent SSE viewers**. That is far above 1,000 viewers / instances, so I expect it not to break first.
- Neon: 100 pooled connections at 80 ms of database time is 1,250 order transactions/s on paper. On 0.25 CU (a quarter of a vCPU) I expect the compute to be the limit well before the connection count: **about 150 to 300 order transactions/s**, so 1,000 orders arriving inside 10 s (100/s) fit, and a burst of 1,000 inside 2 s (500/s) does not.
- **My bet for the first thing to break: the shared Neon compute (CPU, not connection count), at an arrival rate of about 200 to 300 mixed requests/s once polling and orders are added together, and not the Vercel limit.**
  A second bet: a cold database at the open (scale-to-zero resume, about 0.5 to 2 s) will cause the first batch of errors regardless of rate.
- The release batch: I expect that 100 orders every 5 s (20/s) drains 1,000 queued orders in 50 s without moving p95 order latency for new orders by more than 2x.

## Does the leaderboard view survive a stampede?

**Yes.** ADR-0014 makes the leaderboard a materialized view refreshed on a schedule, so a read is an index scan of a stored result and does not compute ranks. I expect 1,000 viewers at 5 s to cost 200 reads/s at a few ms each, which is small next to the orders. What I expect to hurt is the **refresh**, not the reads: `REFRESH MATERIALIZED VIEW` takes a lock and CPU on the same compute, so a refresh during the burst is the thing to switch off first (kill switch 1). I will test reads and refresh separately, and I will not propose anything other than the view unless it fails.

## Read/write isolation

Separate pools bound connections, not CPU. All pools connect to one Neon compute, so I predict **partial isolation**: a read stampede cannot exhaust the order pool's connections (that part isolates), but it will still slow orders by contending for the same CPU (that part does not). I expect order p95 to rise under a read stampede even with its own pool, by less than it would with a shared pool.
