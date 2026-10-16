# Contention: what a leaderboard read costs a ledger write

Date: 2026-10-16T12:39:10Z. Neon production branch of the Bullpen project, Postgres 18.6, database `neondb`, through the pooled host as
`trading_owner`. Client: my laptop, Node v26.11.1, `pg` over the public internet, so every statement carries a round trip
of tens of milliseconds that a function in the same region would not. Compare rows with each other, not with a production p95.

**Compute is fixed at 0.25 CU on production.** It does not scale up for this run.

**Batch size:** 2,000 accounts (50 from a smoke run of the same script, 1,950 from this one), each holding 5 positions, so 10,000
positions; the ledger grew from 160 rows by every measured buy. Prices are 5 test symbols with source `test`.

## What I ran

```
DATABASE_URL_TRADING=<owner URL> DATABASE_URL_MARKET_DATA=<owner URL> \
  pnpm --filter @bullpen/fitness-checks db:measure-contention -- --accounts 2000 --seconds 30 --writers 8
```

8 writers buy 1 unit of a test symbol on a random account in a loop (`placeMarketBuy`, the real transaction). N readers loop on
the read path, each cell for 30 seconds. "Computed on read" is `computeLeaderboardOnRead`, the ranking query over the source
tables; "materialized view" is `readLeaderboardRows`, a select from `trading.leaderboard_mv`. The script is
`architecture/fitness/scripts/measure-contention.ts`; every row it wrote carries the test marker and is removed by
`db:cleanup-test-data`.

## Result

```
batch: 1950 accounts, 9750 positions, 160 ledger rows before; 8 writers; 30 s per cell

| N readers | Read path | Ledger write p50 / p95 | Leaderboard read p95 | Writes | Reads |
|---|---|---|---|---|---|
| 0 | none (baseline) | 545 ms / 878 ms | n/a | 417 | 0 |
| 10 | computed on read | 589 ms / 628 ms | 204 ms | 409 | 1859 |
| 10 | materialized view | 600 ms / 660 ms | 115 ms | 376 | 2906 |
| 50 | computed on read | 1003 ms / 1275 ms | 958 ms | 238 | 2255 |
| 50 | materialized view | 853 ms / 1005 ms | 365 ms | 280 | 6281 |

Refresh (CONCURRENTLY), 1950 accounts: 70 refreshes, duration p50 421 ms, p95 506 ms
Ledger write p95 with no refresh running: 669 ms; during back-to-back refreshes: 617 ms
```

## What it says

- With nobody reading, a buy costs about 545 ms at p50 from here. That is the baseline.
- At N = 10 neither path moves the writes much; the view serves the same readers faster (read p95 115 ms against 204 ms).
- At N = 50 both paths slow the writes, the view less: write p95 1,005 ms with the view against 1,275 ms computed on read, and the
  read p95 is 365 ms against 958 ms. The view is cheaper, not free: 50 readers still share 0.25 CU with the writers. "No reader
  waits for a refresh" holds (no lock is taken); "reads cost nothing" does not.
- A refresh takes about 420 ms (p95 506 ms) for 2,000 accounts. Ledger write p95 during back-to-back refreshes was 617 ms against
  669 ms with none running: within the noise of a 30-second cell, so I found no measurable cost of the refresh itself.
- Each cell is 30 seconds and one run. The N = 0 row's p95 (878 ms) is higher than two of the cells with readers, which says how
  much run-to-run noise there is: differences under about 200 ms between cells are not evidence.
