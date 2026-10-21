# Experiment 3: a crash after a side effect and before success is recorded

Date: 2026-10-21T00:07Z (2026-10-20 17:07 local). Commit: 43267d9 (the commit that adds the tests; no uncommitted code changes). Database: a throwaway Postgres 17 container started by `test-db.sh`; nothing here touches Neon.

Command (from `architecture/fitness`):

```
pnpm test:db src/db-integration/orders-recovery src/db-integration/orders-lifecycle --reporter=verbose
```

Each step can be stopped at a named boundary, before the commit (the transaction rolls back) or after it (the caller never hears).
The step is then run again. The tests assert the end state has one reservation, one fill, one pair of ledger entries, one position
and one release, whatever the boundary. The submit, fill, cancel and release steps are covered at every boundary they have; the last
case is a crash between handing an order to the venue and marking it working, which the next sweep completes with one order at the
venue.

## Verbatim output (lines for this experiment)

```
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > submit dying at submit:after-reserve rolls back, and the retry reserves once 17ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > submit dying at submit:after-order rolls back, and the retry reserves once 15ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > submit dying after the commit: the retry returns the same order and reserves nothing more 14ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a fill dying at fill:after-fill-row: the retry leaves one fill, one pair of ledger entries and one position 19ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a fill dying at fill:after-ledger: the retry leaves one fill, one pair of ledger entries and one position 19ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a fill dying at fill:before-commit: the retry leaves one fill, one pair of ledger entries and one position 21ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a fill dying at fill:after-commit: the retry leaves one fill, one pair of ledger entries and one position 21ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a release dying at release:before-update: the retry returns the unused reservation once 21ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a release dying at release:after-commit: the retry returns the unused reservation once 20ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a cancel request dying at cancel:before-commit: the retry leaves one cancel_requested order 18ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a cancel request dying at cancel:after-commit: the retry leaves one cancel_requested order 17ms
 ✓ orders-recovery.int.test.ts > experiment 3: a crash after a side effect and before success is recorded > a crash between handing the order to the venue and marking it working: the next sweep completes it, the venue holds one order 24ms
```

Not covered here: a crash of the sweep route or a SIGTERM to a daemon mid-tick. Those are tested with the daemon (see the Decision 1
report), because they need the process.
