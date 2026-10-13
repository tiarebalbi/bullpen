# ADR-0014: The leaderboard as a materialized view

## Status

Proposed

## Date

2026-10-13

## Summary

Materialized view, no queue yet, written switch criteria

## Part

3

## Context

The leaderboard ranks every account by cash plus positions valued at the price
contract. Computed on every read, it joins accounts, positions and prices, and
it competes with the writes that fill orders. Part 1's data-contention reason
for splitting needs evidence either way, and the plan has a queue arriving in
Part 5.

## Decision

`trading.leaderboard_mv` is a materialized view over trading positions and the
read-only price contract, ranked, with a unique index so it refreshes
`CONCURRENTLY`. No queue yet.

- **Refresh** after the end-of-day ingest, and when a read finds the view older
  than 5 minutes.
- **No reader waits.** A stale read returns the current ranking with its as-of
  time and starts the refresh after the response, under a non-blocking advisory
  lock; if the lock is taken, it skips.
- **A failed refresh leaves the last good ranking**, and the page shows its
  age.
- **A reconciliation check** runs in CI: the view must equal the same ranking
  computed on read from the source tables. It fails for a fill after the last
  refresh and for a tampered row, naming the account and both values.
- **Switch criteria**, written down so the switch is not made by feeling: move
  to a read model fed by a queue when a second consumer needs price or fill
  events, or when leaderboard read p95 exceeds 500 ms at market open. Until
  then, no queue.

## Consequences

- The ranking can be up to 5 minutes old, and says so. A fill is not in the
  ranking until the next refresh.
- The contention measurement in `architecture/reports/part-03/contention.md`
  is a simulated burst, not a live market open: it compares the view with the
  compute-on-read query under N concurrent readers, and records ledger write
  latency while a refresh runs.
- The view reads `market_data.prices_v1`, so a change to the price contract is
  a change to the leaderboard.

## Alternatives

- **Compute on read** — the baseline the measurement compares against.
- **A read model fed by a queue** — held back by the switch criteria above.
- **Refresh on every fill** — rejected. It would put the refresh on the write
  path the ledger shares.

## Links

- ADR-0002 (data contention), ADR-0012 (data ownership), ADR-0013 (one Market
  Data owner).
- `architecture/fitness/src/db-integration/reconcile-check.ts` — the
  reconciliation check.
