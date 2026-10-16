# Contention: what a leaderboard read costs a ledger write

> **2026-10-16: Neon suspended the project's compute.** The project had used 100% of its 5 GB monthly network transfer on the Free
> plan, mostly from the runs in this file: each full-ranking cell moved about 1.7 GB (2,000 accounts read whole, about 190 reads a
> second for 30 seconds), and I ran several. The runs below are the measurements I have; no further run touches Neon until the
> allowance resets. The cause is my measurement design, not the product: the page never reads 2,000 rows (the route now caps a read
> at the top 50 plus the caller's row, `leaderboard-payload.md`), and every measurement script now estimates its transfer before it
> starts and refuses a run that would pass a share of what is left (`scripts/transfer-budget.ts`). A cold-start run that was
> under way against the preview was stopped at the same time, after 6 of its 10 rounds, and kept nothing.

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

## What the table says, and what it does not

- With nobody reading, a buy costs about 545 ms at p50 from here. That is the baseline.
- At N = 10 neither path moves the writes much; the view serves the same readers faster (read p95 115 ms against 204 ms).
- At N = 50 both paths slow the writes, the view less (write p95 1,005 ms against 1,275 ms computed on read; read p95 365 ms against
  958 ms). I first read this as 50 readers sharing 0.25 CU with the writers. **The diagnosis below shows that reading was not
  supported by the data**, and this table alone cannot say why N = 50 is slower.
- A refresh takes about 420 ms (p95 506 ms) for 2,000 accounts. Ledger write p95 during back-to-back refreshes was 617 ms against 669 ms with
  none running: within the noise of a 30-second cell, so I found no measurable cost of the refresh itself.
- Each cell is 30 seconds and one run. The N = 0 row's p95 (878 ms) is higher than two of the cells with readers: differences under about
  200 ms between cells are not evidence.

## Diagnosing the N = 50 slowdown

Question: is the slowdown CPU on the 0.25 CU compute, connection or pool queueing, or lock waits? I reran the baseline and the N = 50 view
cell with sampling, and added one cell that changes only how much each read returns. While each cell ran, a separate connection sampled
`pg_stat_activity` for the role's sessions every 250 ms (state and wait event), `EXPLAIN (ANALYZE)` timed a leaderboard read on the server about
every second, and the script recorded its own pool queue and Node's event-loop delay. Command:

```
pnpm --filter @bullpen/fitness-checks db:measure-contention -- --accounts 2000 --seconds 30 --writers 8 --diagnose
```

Output, verbatim (the same 2,000 accounts; 6,634 ledger rows before the first cell):

```
batch: 2000 accounts, 10000 positions, 6634 ledger rows before; 8 writers; 30 s per cell


### 0 readers, 8 writers, 30 s
client: ledger write p50 / p95 544 ms / 574 ms (439); leaderboard read p95 n/a (0)
server: leaderboard read executes in p50 1.16 ms / p95 1.59 ms (EXPLAIN ANALYZE, 22 samples); planning p50 0.07 ms
this machine: Node event-loop delay p50 11.0 ms / p95 11.2 ms / max 16.2 ms; 0 rows per read, 0 rows a second received
sessions of this role, 88 samples: active avg 0.0, max 1; our pool: max 8 connections, max 0 callers waiting for one
what those sessions were in (sample counts):
    2683  idle | Client | ClientRead
     566  idle in transaction | Client | ClientRead
       4  active | CPU or running | -
       3  idle in transaction | CPU or running | -

### 50 readers, the whole ranking (2,000 rows a read), 8 writers, 30 s
client: ledger write p50 / p95 1135 ms / 1535 ms (213); leaderboard read p95 463 ms (5650)
server: leaderboard read executes in p50 1.18 ms / p95 15.30 ms (EXPLAIN ANALYZE, 17 samples); planning p50 0.04 ms
this machine: Node event-loop delay p50 10.2 ms / p95 11.5 ms / max 22.4 ms; 2000 rows per read, 376667 rows a second received
sessions of this role, 66 samples: active avg 1.7, max 8; our pool: max 58 connections, max 0 callers waiting for one
what those sessions were in (sample counts):
    2209  idle | Client | ClientRead
     437  idle in transaction | Client | ClientRead
     110  active | CPU or running | -
       3  active | IPC | SyncRep
       2  idle | CPU or running | -
       2  active | Lock | transactionid

### 50 readers, the top 20 rows a read, 8 writers, 30 s
client: ledger write p50 / p95 553 ms / 648 ms (428); leaderboard read p95 101 ms (17965)
server: leaderboard read executes in p50 1.21 ms / p95 4.53 ms (EXPLAIN ANALYZE, 22 samples); planning p50 0.03 ms
this machine: Node event-loop delay p50 10.2 ms / p95 11.0 ms / max 15.6 ms; 20 rows per read, 11977 rows a second received
sessions of this role, 86 samples: active avg 0.9, max 11; our pool: max 58 connections, max 0 callers waiting for one
what those sessions were in (sample counts):
    3304  idle | Client | ClientRead
     569  idle in transaction | Client | ClientRead
      72  idle | CPU or running | -
      69  active | CPU or running | -
       4  active | IPC | SyncRep
       1  none | CPU or running | -
       1  idle in transaction | CPU or running | -
       1  active | Lock | transactionid
       1  active | Client | ClientRead
```

What the evidence points to:

| Candidate | What I captured | Verdict |
|---|---|---|
| Lock waits | `Lock / transactionid` in 2 of 2,763 session samples in the full-ranking cell, 1 of 4,022 in the top-20 cell | not it: two writers picked the same random account now and then |
| Pool queueing on my side | my pool never had a caller waiting (max 0), 58 connections for 58 loops | not it |
| CPU on the 0.25 CU compute | a read executes in 1.2 ms at p50 on the server in every cell (p95 4.5 to 15 ms under load); active sessions averaged 1.7 of 58; and with the top 20 rows, 600 reads a second (three times the full-ranking rate) left ledger write p95 at 648 ms against 574 ms idle | not the limit at this load; the server is mostly idle |
| Bytes moved | the slow cell received 376,667 rows a second (about 1.7 GB in 30 seconds); the cell that sent 20 rows a read did not slow the writes at all, with three times as many reads | **this is what changes between the cells** |
| My machine's event loop | event-loop delay p95 11 ms in all three cells (the timer's own resolution is 10 ms) | not it |

So the 1,005 ms (and 1,461 to 1,535 ms in the reruns) comes from reading the whole ranking 190 times a second, and not from the database
doing more work. The data does not say which hop carries the cost: my network link, or Neon's proxy and pooler on the way, since both
move the same bytes and I have no counter on either. It also does not say what a read of the whole ranking costs in production, where a
page reads a page of rows, not 2,000, and where the readers' bytes do not cross my laptop's connection.

What I take from it for the post: the claim that stands is "no reader waits for a refresh, and a read costs the server about a
millisecond". The claim I cannot make is that 50 concurrent readers of 2,000 rows cost a ledger write nothing. They did not, and the cause I can
rule out is the compute, not the one I can name.
