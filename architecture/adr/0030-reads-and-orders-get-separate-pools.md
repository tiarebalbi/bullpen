# ADR-0030: Reads and orders get separate connection pools, on one compute

## Status

Proposed

## Date

2026-11-12

## Summary

Two pools bound each path; one compute still couples them

## Part

5

## Context

At 9:30 ET every open screen polls prices, the leaderboard and its own account while a burst of orders arrives. In Part 3 and Part 4 every trading route shared one pool of three connections, so a flood of cheap reads could hold all
of them and a player's order would wait in the same queue as a leaderboard poll. Part 5's brief is that reads must not starve writes. The honest limit, which Part 3 already measured, is that separate pools in the Trading App
still connect to one Neon compute: a pool bounds connections, not CPU.

## Decision

The order path and the read paths each get their own bounded pool, and one build rule keeps them apart.

- **Two module-scope pools per function instance**, made once per module (Fluid compute reuses an instance for many requests) and attached with `attachDatabasePool` so idle connections are closed before the instance is suspended:
  the **order pool** (`apps/web/app/lib/trading/orders/pool.ts`, 6 connections, a 5 s wait) for placing, cancelling and the sweep, and the **read pool** (`apps/web/app/lib/trading/reads/pool.ts`, 4 connections, a 2 s wait) for prices, the price stream, the
  leaderboard, the account poll and the health check. Both connect with the existing `DATABASE_URL_TRADING` (a Neon pooled host in transaction mode; the code says once in the log if the host is not pooled) and name themselves in
  `application_name` (`bullpen-orders`, `bullpen-reads`) so a measurement can count each pool's connections.
- **A pool is also where work waits inside an instance.** A request that cannot get a connection fails after the pool's wait, with the route's existing 503 (a safe refusal) instead of queueing without end. Reads wait less than orders.
- **One rule the build can check** (`structure.adl`): code in the leaderboard and stock-price routes, the price routes and `lib/trading/reads` may not import `lib/trading/orders`. A failing fixture proves the check bites.
  What the build cannot check: the account poll shares a route file with order placement (`/api/orders` has a GET and a POST), so its GET uses the read pool by its own import and a test pins which handler uses which pool.
- No environment variable is added or changed: both pools use the URL that was already set.

## Consequences

Measured on a local stack (`post-facts/part-05.md`): with the compute not saturated, a 4x read overload (1,800 requests a second) left orders served on separate pools (2,998 of 3,001, p95 19 ms to 144 ms) and starved them on one
shared pool (2 of 3,001, p95 9.1 s). With the compute held to a quarter of a core, both paths failed together whichever way the pools were drawn. The same measurement found the first thing to break was not a pool: the account poll
scanned three tables sequentially, which migration `0009` fixes.

- A stampede of reads can hold at most the read pool's 4 connections per instance; the order pool's 6 stay free for orders. How much isolation that buys under load is measured in `post-facts/part-05.md`, which says where it stops.
- Postgres connections now scale as 10 per instance (not 3) before the pooler multiplexes them: with the Neon pooler's 0.9 x 112 = about 100 server connections at 0.25 CU, ten instances would use them all. This is a trade, and the measurement reports it.
- One compute still serves both pools. When the compute's CPU is the limit, reads and orders slow down together, whatever the pools say. The report states the coupling it measured instead of claiming more.

## Alternatives

- **One pool and a semaphore for orders.** Equivalent in effect for connections, but it hides the split from `pg_stat_activity`, and the rule above could not be stated as an import boundary.
- **A separate Neon compute or read replica for reads.** Real isolation of CPU, and a Neon setting and a bill line; out of reach on the free tier and outside what this part may change.
- **A priority queue in front of the database.** More code and a new moving part to guard a resource whose only two consumers can be told apart by the route they arrive on.
- **Caching the reads.** A cache holds a previous answer; it is not a place where work waits. The leaderboard is already a materialized view (ADR-0014) and the price stream (ADR-0029) already shares one read among all viewers.

## What would flip it

- The measurement showing that the read pool's 4 connections starve nothing and the order pool's 6 are never busy: one pool would do.
- A second compute becoming affordable: the read pool would point at it.

## Links

- ADR-0012 (a schema and role per owner), ADR-0014 (the leaderboard as a view), ADR-0029 (the price stream), ADR-0028 (admission at the open).
- Vercel, [Fluid compute: connection pooling](https://vercel.com/docs/functions/runtimes/node-js) and `@vercel/functions` `attachDatabasePool`, read 2026-11-12.
- `post-facts/part-05.md` — what the isolation measured.
