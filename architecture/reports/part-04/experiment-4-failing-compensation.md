# Experiment 4: a compensation that keeps failing

Date: 2026-10-21T00:07Z (2026-10-20 17:07 local). Commit: 43267d9 (the commit that adds the tests; no uncommitted code changes). Database: a throwaway Postgres 17 container started by `test-db.sh`; nothing here touches Neon.

Command (from `architecture/fitness`):

```
pnpm test:db src/db-integration/orders-recovery src/db-integration/orders-lifecycle --reporter=verbose
```

The compensation is the release of what a cancelled order did not spend. The test makes the release fail on every sweep
(`connection reset while releasing`), runs five sweeps, then lets it succeed.

What the order looks like while the release fails: status `cancelled`, filled 4 and cancelled 6, `needs_attention = release-failing`;
the reservation has `released_at = NULL`, `release_failures = 5` and the last error text; buying power still has the 1,050 held
(650 of it unused), so no money is lost. It is retried on every sweep (one failure each time, five sweeps) and flagged exactly once,
on the third failure (`MAX_RELEASE_FAILURES = 3`). The invariants hold while it is stuck, because money held by a reservation is counted
as reserved. After the cause is gone the next sweep releases 650, clears the flag and leaves buying power at 9,600 and the position at 4.
A further sweep does nothing.

What is not shown: nothing pages anyone yet. The flag is a column; surfacing it (a count on a status route, an alert) is not built.

## Verbatim output (lines for this experiment)

```
 ✓ orders-recovery.int.test.ts > experiment 4: a compensation that keeps failing > the order is flagged after the limit, the release keeps retrying, and recovery leaves the account correct 53ms
```
