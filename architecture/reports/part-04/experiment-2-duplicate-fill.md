# Experiment 2: a duplicate fill after a lost acknowledgement

Date: 2026-10-21T00:07Z (2026-10-20 17:07 local). Commit: 43267d9 (the commit that adds the tests; no uncommitted code changes). Database: a throwaway Postgres 17 container started by `test-db.sh`; nothing here touches Neon.

Command (from `architecture/fitness`):

```
pnpm test:db src/db-integration/orders-recovery src/db-integration/orders-lifecycle --reporter=verbose
```

The first delivery of a fill committed; the caller never heard (a crash at `fill:after-commit`). The retry is the second delivery.
The test compares the account after the retry with a control order that saw the fill exactly once: ledger, position, fills,
reservation, buying power and the order's quantities and state are equal. A second case has the venue deliver every fill twice.

## Verbatim output (lines for this experiment)

```
 ✓ orders-recovery.int.test.ts > experiment 2: a duplicate fill after a lost acknowledgement > the first delivery committed and its acknowledgement was lost: the second changes nothing 194ms
 ✓ orders-recovery.int.test.ts > experiment 2: a duplicate fill after a lost acknowledgement > a venue that delivers every fill twice leaves the account as if it had delivered once 34ms
```

Full output of the run, which also covers experiments 3 and 4 and the lifecycle rules: `raw/experiments-2-4-and-rules-output.txt`.
