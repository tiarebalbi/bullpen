# Experiment 1: the cancel that races partial fills

Date: 2026-10-21T00:04:26Z to 2026-10-21T00:06:51Z (2026-10-20 17:04 to 17:06 local). Commit: 43267d9 (the commit that adds the tests; no uncommitted code changes). Database: a throwaway Postgres 17 container started by `test-db.sh`; nothing here touches Neon.

Command (from `architecture/fitness`):

```
PART4_REPORT_DIR=<repo>/architecture/reports/part-04/raw PART4_RACE_SEEDS=1500 pnpm test:db src/db-integration/orders-race --reporter=verbose
```

The ordering rules are written first, in ADR-0017 ("The simulator's ordering rules"): a fill has a unique id and a venue
`executed_at`; a cancel request is not a cancel; the venue confirms with an `effective_at`; every fill with `executed_at <
effective_at` exists and is owed wherever it arrives; none at or after it exists.

## Result

| Part | Runs | Failures |
|---|---|---|
| Exhaustive: every allowed delivery order of the plans below | 8,346 | **0** |
| Seeded random, delivered concurrently, with duplicates and crashes (seeds 1 to 1500) | 1,500 | **0** |

A run is one account, one 10-share order and its own price. After every run the invariants are read from the tables
(`checkOrderInvariants`): buying power never negative; available + still-reserved + spent = starting cash; filled + open +
cancelled = ordered; each order's filled quantity = the sum of its booked fills; each position = what the ledger booked; each
reservation's spent = what the ledger took. The run also checks the final state the rules predict (filled when the existing
fills add up to the order, cancelled otherwise; filled and cancelled quantity; reservation released; buying power = starting cash
minus what the fills cost). After each test the Part 3 leaderboard reconciliation check also ran and passed.

## Exact interleavings covered (exhaustive)

Events: `F1..F3` the fills that exist, `C` the cancel request, `A` the venue's confirmation, `Dn` a second delivery of fill n
(after the first, which is not always acknowledged), `R` a release attempt (at a time past the late-fill window, so it can run
before late fills have arrived). Constraints: `C` before `A`; `Fn` before `Dn`. Everything else in every order.

- two plans of fill sizes: 4,3,2 (the order can never fill) and 4,3,3 (the fills complete the order);
- for each, 0, 1, 2 or 3 of the three fills exist (the rest would have executed at or after the cancel's effective time and so
  never exist);
- for each, every duplicate choice (the duplicate of fill 1, 2 or 3) and every order of the events that respects the constraints.

That is 8,346 distinct sequences, listed one per line in `raw/race-exhaustive-interleavings.txt` (summary: `raw/race-exhaustive-summary.json`,
`distinctInterleavings: 8346`). They include a fill arriving after `A` made the order cancelled, `A` arriving before the last fill,
`C` after the order is already filled (answered too-late), `R` before and after `A`, and a release followed by a late fill that has
to take its money back from buying power.

## Seeded random (concurrent)

Seeds 1 to 1500. A seed fixes the plan (1 to 4 planned fills with random sizes, some partial; how many exist), which fills are
delivered twice, the order, how the events are grouped into waves delivered at the same moment (1 to 3 at once; `C` and `A` are
never in the same wave, because the confirmation answers a request that has committed), and where a crash is injected. Totals over
the 1,500 runs: **1,985 crashes injected** at the named boundaries (before and after the commit of a fill, a cancel request, a
confirmation and a release; each followed by a retry), **1,676 waves with more than one event in flight**, **915 duplicate
deliveries**. Summary: `raw/race-random-summary.json`.

## Do the checks fail when something is wrong?

Yes. Once, I made the lifecycle drop any fill that arrives after the order is cancelled (a one-line change, reverted after) and
ran the exhaustive part:

```
EXHAUSTIVE runs=8346 failures=4330
```

(Run on 2026-10-20 at about 17:00 local, on the uncommitted tree; I did not keep the full output of that run.) The test
`the invariant checks can fail` also corrupts an account, a position and an order by hand and expects each to be reported.

## Verbatim output

```
$ bash scripts/test-db.sh src/db-integration/orders-race --reporter=verbose

 RUN  v5.0.2 <repo>/architecture/fitness

stdout | src/db-integration/orders-race.int.test.ts > experiment 1: the cancel races the fills > holds for every allowed delivery order of small plans (exhaustive)
EXHAUSTIVE runs=8346 failures=0

 ✓ src/db-integration/orders-race.int.test.ts > experiment 1: the cancel races the fills > holds for every allowed delivery order of small plans (exhaustive) 75100ms
stdout | src/db-integration/orders-race.int.test.ts > experiment 1: the cancel races the fills > holds for seeded random plans delivered concurrently, with duplicates and crashes
RANDOM seeds=1..1500 runs=1500 failures=0 crashes_injected=1985 concurrent_waves=1676 duplicate_deliveries=915 late_fill_window_ms=30000

 ✓ src/db-integration/orders-race.int.test.ts > experiment 1: the cancel races the fills > holds for seeded random plans delivered concurrently, with duplicates and crashes 43236ms
 ✓ src/db-integration/orders-race.int.test.ts > experiment 1: the cancel races the fills > the invariant checks can fail: a corrupted account is reported 26337ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  17:04:26
   Duration  145.14s (tests 100%)
```
