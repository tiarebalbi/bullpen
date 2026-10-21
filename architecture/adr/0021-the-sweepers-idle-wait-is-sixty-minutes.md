# ADR-0021: The sweeper's idle wait is sixty minutes

## Status

Accepted

## Date

2026-10-21

## Summary

With no order open the sweeper waits up to 60 minutes

## Part

4

## Context

ADR-0018 has the sweeper wait at most 15 minutes between calls while no order is open, and 5 seconds while one is. Every call reaches Postgres, and Neon suspends
a compute only after 5 minutes without activity, so the idle ceiling decides how many hours a day the compute is awake with nobody trading. The cost model in
`architecture/reports/part-04/decision-1-sweep-driver.md` puts the 15-minute ceiling at 8.17 awake hours a day, 61.3 CU-hours and about $6.50 a month of compute alone at 0.25 CU. The
owner's line for flipping to a driver that touches Postgres only when an order's timer fires is 8 hours a day, so the 15-minute ceiling is already over it.

## Decision

The sweeper's idle wait doubles from 10 seconds up to 60 minutes, not 15, and nothing else about its cadence changes.

- **Idle ceiling: 60 minutes** (`MAX_MS` in `apps/sweeper/src/ticker.ts`). While an order is open the wait is still 5 seconds, and after a failure it is still at most 5 minutes.
- **What it costs, computed on the ticker's own wait function on a virtual clock** (`pnpm --filter @bullpen/fitness-checks cadence-model`, output `architecture/reports/part-04/raw/cadence-model.json`): with
  no order all day, 32 calls a day (960 a month), the compute awake 2.34 hours a day, 17.5 CU-hours and about $1.86 a month; with orders open for one hour a day, 457 calls a day, 3.17 hours, 23.8 CU-hours, about $2.52.
  Neon is modelled, not measured: the console's CU-hours are the check once a daemon runs.
- **What it changes for a stuck order.** A player's own requests still move that player's orders (ADR-0017, ADR-0018), so a player never waits for the sweeper. The sweeper is the safety net for an order
  nobody is polling, for example one left behind by a crash, and while nothing is open that net is now checked at most every 60 minutes instead of every 15. When the sweeper finds an open order it returns to 5 seconds.
- **A flagged order does not hold the fast cadence** (the owner's condition, 2026-10-21). The sweep's `open` count, which is what keeps the sweeper at 5 seconds, excludes orders flagged for a person (a release that kept failing, a cancel nobody
  confirmed). They are still retried on every tick, so they heal when the cause goes, but at the idle interval: a stuck order cannot keep Neon awake or spend the invocation quota. An order is flagged on the third failed release, so a failing
  release is retried at 5 seconds at most three times. `flagged` stays in the reply. Test: `orders-tick.int.test.ts`, "a flagged order does not hold the fast cadence".
- The 15-minute `WORKING_DEADLINE` (a working order with no fillable price is cancelled after it) is a deadline on the order, not the daemon's wait, and is unchanged.

## Consequences

- A stuck order that no player touches can wait up to an hour, plus the accept or working deadline, before it is found. Its money stays reserved, not lost; the invariants do not depend on how soon it is found.
- The daemon's own CPU and invocations fall (about 32 calls a day idle instead of about 100); the Neon bill falls by about $4.64 a month in the no-order case.
- ADR-0018 is not edited: it records the decision as made, and this ADR supersedes only its idle ceiling.

## Alternatives

- **Keep 15 minutes** (ADR-0018): $6.50 a month of compute for a safety net, and over the owner's 8-hour line.
- **A delayed Queues message or a Workflows `sleep` per order:** touches Postgres only when an order's timer fires, but is not built or measured in Part 4 (see Decision 1) and needs a deployment.
- **Longer than 60 minutes:** saves little more (30 minutes is 4.25 hours, 60 is 2.34, and the floor is the 5-minute suspend window each call keeps open) and lengthens how long a stuck order goes unnoticed.

## Links

- ADR-0018 (the sweeper is a daemon that calls a route) — the decision whose idle ceiling this changes.
- `architecture/reports/part-04/decision-1-sweep-driver.md` — the cost model.
