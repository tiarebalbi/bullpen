# Part 5: the market open, where the work waits — post facts

Answers to the 11 items in the brief. Each says where it came from. Raw results are in `post-facts/part-05-runs/` (one JSON per case); `pnpm --filter @bullpen/fitness-checks exec tsx src/load/summarize.ts`
prints the tables below from them. The predictions I committed before any run are in `post-facts/part-05-predictions.md` (commit `d96f1ec`, 2026-11-12 19:12 UTC, before the first k6 run).

## Read this first: what these numbers are, and are not

- **Every load number here comes from one machine.** k6, the stand-in Trading App, the real sweeper and Postgres 16 all ran on a 4-core, 16 GB container (`environment` in each run file). The load generator takes
  CPU from the thing it measures. These are **application capacity under simulated constraints** (the brief's words for the local rows), not Vercel's and not Neon's.
- **The stand-in is not Next.js.** `apps/web/scripts/load-server.ts` has no sign-in; a request names its account in a header. It shares with the deployed app everything below the route handlers: the two pools exactly as
  `lib/trading/orders/pool.ts` and `reads/pool.ts` make them, the lifecycle, the sweep and admission, the price hub and stream, the leaderboard read and the moderation path. Next.js, Neon Auth and Vercel's limits
  (1,000 concurrent executions per 10 s, the 503) are **not** in any number below.
- **The database is a local Postgres 16 cluster, not Neon, and not Postgres 17.** "db 0.25" means the cluster's processes are stopped and continued on a 20 ms duty cycle so they get a quarter of one core
  (`src/load/throttle.ts`). That approximates 0.25 CU's CPU and is harsher than it in one way: a stopped backend that holds a lock holds it for the stopped part of the cycle.
- **Nothing was run in the cloud.** No Hobby preview run, no Neon branch run (you create that branch; I did not). `architecture/fitness/load/cloud.js` is written and not run. So **no number here is a statement about 1,000
  hosted users**, and none is presented as one.
- **Every run starts from a league with history.** 1,000 players each with 20 filled orders in the past (20,000 orders, 20,000 fills, 40,000 ledger rows), so the tables are not empty, as they are not after a few weeks.
- **A harness mistake contaminated a first pass, and I reran it.** A run ended its `pnpm` wrapper but not the `node` process under it, so a throttle kept the database slow through every later case. I found it because
  unthrottled cases came out slower than throttled ones. Every case from the first throttled one onward was rerun after the fix (process groups are killed; strays are cleared at the start of a run). The contaminated files
  are in git history (`3cd99d8`) and replaced in the final commit. The three `before-*` runs and the `step-100-db1` and `step-150-db1` runs were made before any throttle existed and were kept.
- **Run-to-run variation exists, and I have not measured it properly.** `step-50-db1` was run three times: order p95 28 ms and 0 dropped; then 46 ms and 20 dropped; then 29 ms and 0 dropped (the file kept).
  The middle run overlapped a stray stress run I had left going by mistake, so it is not a fair sample of variation; I did not repeat the configuration enough times to give a spread. I quote the kept file and say
  when a result is near a threshold (`step-100-db1` dropped 12 iterations against a threshold of 10).

## What I found that nobody asked for

1. **The account poll was a sequential scan of three tables.** `EXPLAIN` on a league with 12,000 orders: `Seq Scan on fills ... Rows Removed by Filter: 12020`, and the same for `orders` and `reservations`, on every poll,
   at one poll per open screen every 3 s. It was the first thing to break (item 3). `0009_account_view_indexes.sql` adds four indexes; `account-view-indexes.int.test.ts` fails without them (checked: it fails with the
   migration removed). Before/after is below. This is a migration the brief did not ask for; it is its own commit (`b0abf18`) so you can drop it.
2. **A database restart ended the whole process.** A pool emits `error` when the database closes an idle connection; with no listener Node exits. In the first stress run the cold-database phase killed the instance and nothing
   answered for the rest of the run (`Unhandled 'error' event ... 57P01 terminating connection due to administrator command`). All three `createPool` functions (trading, handles, market-data) now log the error and carry on,
   with a test each. This is a fix to code that is in production today, not to code in this part.

3. **An open stream with no prices said nothing.** With the database unreachable the stream stayed open sending empty ticks, so the screen waited forever instead of falling back to polling and saying "Database unavailable".
   Found by the existing e2e specs (4 of the 95 failed), not by me. The stream now sends an `unavailable` event while it holds no prices; the client treats it as a failure (polls at once, retries later) and keeps the HTTP
   status the poll got, which is what the old screen words its error from.
4. **`export const maxDuration = X / 1000` does not build.** Next reads that value literally; `next build` caught it, the unit tests did not. It is `300`, and a test holds it equal to the constant the stream's lifetime is checked against.

## 1. Each prediction, graded

| Prediction (`part-05-predictions.md`) | Measured | Verdict |
|---|---|---|
| Market Open Queue not needed | 1,000 queued orders admitted from Postgres in 55.9 s, the sweeper waking 506 ms after the open; no queue service involved | **Right** |
| Order Saga workflow not needed | The state machine took one new state; no workflow engine; Part 4's invariants held in every run | **Right** |
| Drain 1,000 in about 50 s at 100 per 5 s; new-order p95 not worse than 2x | Drain 55.9 s (admissions: 100 in the busy second of each pass); new-order p95 29 ms against 18-19 ms alone (1.5-1.6x) | **Right** |
| Leaderboard view survives a stampede; the refresh is what hurts | 1,500 req/s, p95 2.3 ms, 0 errors, 0 dropped, with the refresh on and off (item 4). The refresh cost did not show: it runs at most once per 5 minutes, under a lock | **Right; the second half untested** |
| Pools isolate connections, not CPU: partial isolation | Item 5: with the compute not saturated, orders survive a 4x read overload on separate pools (p95 19 ms to 144 ms) and are starved on a shared one (goodput 3001 to 2). With the compute saturated, both fail together | **Right** |
| About 900 SSE viewers per instance at 1,024 descriptors | 990 viewers held 1,131 descriptors, so 141 are not viewers; at 1,024 that is **about 880 viewers** | **Right (within 2%)** |
| What breaks first: the shared compute's CPU, at 200-300 mixed req/s | **Wrong about the cause, right about the resource.** The database CPU did go first, but at ~400 req/s and because of three sequential scans per account poll (found above), not because the compute is small. After the indexes the knee moved to ~500 req/s on this machine. At a quarter core it is **far lower** than my guess: the 9:30 step fails at 400 req/s (item 3) | **Partly wrong** |
| A cold database at the open causes the first errors | Cold database: ~3 s of 503s, recovery 2.5 s after the database returned. The first errors in the other runs were pool waits, not a cold start | **Right, and it exposed bug 2** |
| 1,000 players within the free tiers | Item 2 | see item 2 |
| A dead feed cannot stop order entry | Item 2 | **Right** |
| Vercel's 1,000 concurrent executions per 10 s, then 503 | **Not measurable here** (no Vercel in the loop) | untested |
| Neon's pooler at 0.9 x 112 connections | Each instance held 11-12 connections (6 + 4 + 1); not measured against Neon | untested |

## 2. Part 1's two promises

**"One deployment can serve 1,000 players within the free tiers": not answered for the hosted deployment.** What the local numbers say: with the account-view indexes, 1,000 queued orders released plus 50 new orders/s plus 1,000
screens polling every 3 s ran with order p95 29 ms and nothing dropped on a full core (`step-50-db1`). As the build stood before the indexes it did not (8.2 s account polls, 13,958 dropped iterations, `before-step-50`).
With the database held to a quarter of a core it did not either (order p95 15.2 s, 14,888 dropped, `step-50-db0.25`). The free-tier part (Active CPU 4 h/month, Neon CU-hours, Vercel's concurrency) needs the Hobby run,
which I did not make. The prediction (yes for a burst, no for a day of constant polling) is neither confirmed nor refuted for the hosted case.

**"A dead market-data feed cannot stop order entry": yes.** Stress run `stress-db1`, feed-down phase: every stored price made stale; 349 account polls and 349 price polls all answered 200 (prices flagged `stale`); 227 order
attempts on the stale symbol refused with `422 stale-price` (a safe refusal, nothing reserved), and the 122 attempted before the prices went stale were accepted; 0 5xx. Recovery 309 ms after the feed returned. Provider
calls over the whole run: 5 granted, 15 refused by the budget gate, none by a player.

## 3. The 9:30 step

Setup: 1,000 players each place one order while the market is closed (all 1,000 `queued_for_open`); the run schedules the open, **starts the real sweeper** (`apps/sweeper/src/main.ts`), which learns the open from the
sweep reply and sleeps until it; k6 starts its arrivals at the open: 50 new orders/s, 333 account polls/s (1,000 screens at 3 s), 17 leaderboard reads/s, for 60 s. Source: `step-50-db1.json`.

| | value |
|---|---|
| Release batch size and cadence | **100 orders per sweep pass, oldest first; one pass per 5 s while the queue is not empty** (20 a second). The pass admits and dispatches each; 100 were admitted inside one second in every full pass |
| Time to drain the backlog | **55.9 s** from the open (1,000 of 1,000 admitted); the sweeper woke 506 ms after the open |
| New-order latency p50 / p95 / p99 | **14 / 29 / 46 ms** (orders alone, in the isolation run: 13 / 18 / 32 ms) |
| Account poll p95 | 11 ms |
| Goodput | **400 requests/s answered in time (1 s) and not 5xx, over the 60 active seconds, against 400 offered**; 0 dropped iterations, 0 errors |
| Part 4's invariants after the run | hold (no negative buying power, quantities add up, cash adds up, every finished reservation released) |
| Whole test duration | the 364/s figure in the summary table divides by the ~66 s the run lasted, which includes the 5 s before arrivals start |

**What broke first, and at what rate** (offered requests per second; the same shape, scaled by the new-order rate):

| Run | Offered | What happened |
|---|---|---|
| `before-step-50` (as built, no indexes) | 400/s | Account polls p95 **8.2 s**; reads pool queue 679; 13,958 dropped. **First to break: the account poll**, a sequential scan of orders, fills and reservations per poll |
| `step-50-db1` (indexes) | 400/s | holds: order p95 29 ms |
| `step-100-db1` | 450/s | holds: order p95 56 ms, account p95 75 ms; 12 dropped (threshold 10) |
| `step-150-db1` | 500/s | gives: order p95 **6.3 s**, order pool waiting 36 then 81, 4,638 dropped. The knee is between 450 and 500 req/s **on this machine** |
| `step-50-db0.25` | 400/s | gives: order p95 15.2 s, drain 148 s, 14,888 dropped. At a quarter core 400 req/s is not served |
| `step-50-gap-db1` | 400/s | the price-gap case (item 7): holds, same latencies |

The brief says to report what broke first, not to hide it: with the build as it stood, the 1,000-screen step did not hold on a full core. After the index migration it does, with about 10% to spare in req/s on this box.

## 4. Polling, SSE and leaderboard stampedes

**Database reads against viewers** (pg_stat_database transactions per second in the steady window; `polling-*` and `sse-*`). The prices path alone is the clean comparison:

| Viewers | Prices by polling every 5 min (the old interval) | Prices by polling every 10 s (the fallback) | Prices by SSE (this part) |
|---|---|---|---|
| 250 | 0.8 reads/s | 25 reads/s | **0.17 reads/s** |
| 500 | 1.7 | 50 | **0.17** |
| 1,000 | 3.3 | 100 | **0.33** (990 viewers held) |

(The polling figures are the offered rate, screens divided by the interval; the SSE figures are the hub's own read counter over the run: 26 reads in each of the three runs, one per 5 s while any client is connected.
Whole-screen load, which is mostly the account poll: 782, 1,572 and 3,119 transactions/s at 250, 500 and 1,000 screens, `polling-fallback-*`; account p95 7 ms at 1,000 screens.)

- **Provider calls: flat.** 0 before and 0 after every SSE run, at 250, 500 and 990 viewers (`providerCalls` in `sse-*.json`). The code is also checked statically (`noProvider.test.ts`: the stream's source mentions no provider,
  budget or market-data service) and by the database (the trading role cannot write `provider_calls`).
- **SSE connections per instance:** 240, 510 and 990 held at once on one instance; **1,131 file descriptors at 990 viewers**, RSS 131 MB, event-loop p99 11 ms, 0 dropped iterations, every stream carried prices.
  With Vercel's 1,024 descriptors that is about 880 viewers per instance.
- **Reconnect behaviour at the cut** (`sse-300s-cut.json`, real lifetime, a real connection): three streams closed themselves after **246.1 s, 252.5 s and 269.9 s**, each with a `bye` event, all before Hobby's 300 s.
  A reconnect with `Last-Event-ID` received `tick` events and **no repeated prices**. (A unit test holds the same: `priceHub.test.ts`.)
- **Leaderboard stampede** (`leaderboard-*.json`): offered up to 2,000 req/s, served ~1,500 req/s on a full core, p50/p95/p99 **1.0 / 2.0-2.3 / 4.1-7.1 ms**, 0 errors, 0 dropped; DB 2,006 transactions/s. The refresh switch made no
  measurable difference (on: p99 7.1 ms; off: 4.1 ms). At the quarter-core approximation, 600 req/s: p95 19 ms. **The materialized view survives a stampede; I did not need to propose anything else (ADR-0014 stands).**

## 5. Isolation between reads and orders

Setup: orders at 100/s alone for 30 s, then the same orders with a read stampede (account polls, leaderboard, prices) beside them for 30 s. "Separate" is the order pool (6) and read pool (4);
"shared" is one pool of 10 for both, as every route used before this part (`iso-*.json`).

| Compute | Reads/s | Pools | Orders alone p95 | Orders with reads p95 | Orders served (alone, with reads) | Reads |
|---|---|---|---|---|---|---|
| full core | 450 | separate | 18 ms | 27 ms | 3001, 3001 | account p95 9.6 ms |
| full core | 450 | shared | 18 ms | 24 ms | 3001, 3001 | account p95 9.0 ms |
| full core | **1,800** | **separate** | 19 ms | **144 ms** | **3001, 2998** | account p95 9.7 s; 29,642 dropped |
| full core | **1,800** | **shared** | 18 ms | **9.1 s** | **3001, 2** | account p95 5.7 s; 21,781 dropped |
| quarter core, scaled (15 orders/s, 120 reads/s) | 120 | separate | 99 ms | 101 ms | 451, 451 | account p95 38 ms |
| quarter core, scaled | 120 | shared | 101 ms | 104 ms | 450, 451 | account p95 39 ms |
| quarter core | 450 | separate | 3.3 s | 6.0 s | 66, 10 | account p95 10.9 s |
| quarter core | 450 | shared | 2.7 s | 10.7 s | 158, 1 | account p95 7.1 s |
| quarter core | 1,800 | separate | 3.2 s | 6.1 s | 65, 8 | account p95 10.0 s |
| quarter core | 1,800 | shared | 2.7 s | 26.9 s | 203, 0 | account p95 19.5 s |

**Isolation achieved, in numbers:** when the compute has room, separate pools keep the order path alive under a 4x read overload: **goodput 2,998 of 3,001 against 2 of 3,001** on one shared pool, and p95 144 ms
against 9.1 s. That is the part of the coupling a pool can remove: the connections. **Where the shared compute still couples them:** orders still slowed 7.6x (19 ms to 144 ms) while the reads were being refused, because
reads and orders spend the same CPU. And once the compute is the limit (a quarter core at 450 reads/s, or orders alone at 100/s on a quarter core), **both fail together whichever way the pools are drawn**; the separate and shared
rows are the same collapse. At a load the quarter core can carry (the scaled rows) the pools make no measurable difference either way. In the quarter-core rows above, orders alone are already past what that compute carries at 100/s, so those rows
show the collapse, not a clean comparison of the pools. So: pools protect orders from a connection stampede; they do not protect them
from a CPU stampede, and the report does not claim they do.

## 6. Each stress case

Steady mixed load of 300 req/s (5% orders, 60% account polls, 8% leaderboard, 20% prices, 7% handle saves), one 40 s phase after another; a Node probe sends an order, an account poll and a price poll every 100 ms
throughout and is what "the player saw" is read from. Full-core run `stress-db1`:

| Case | What the player saw | Order entry | Recovery |
|---|---|---|---|
| **Stock feed down** (every price stale for 25 s) | prices shown flagged stale; polls 200; orders on a stale symbol: `422 stale-price` (227 of 349), nothing reserved | **survived**: 0 5xx, p95 18 ms | **309 ms** after the feed returned |
| **Provider quota exhausted** (budget gate: 5 granted, 15 refused; prices stale) | same as above; the market-data service's gate refused 15 calls before any could leave; no player triggered one | **survived**: 0 5xx, p95 18 ms | **321 ms** |
| **Moderation down** (provider hangs to its 2 s timeout) | handle saves took 2 s and ended in review; everything else unchanged | **survived**: p95 22 ms (baseline 21 ms) | **261 ms** |
| **Leaderboard stampede** (+1,500 req/s) | leaderboard and polls answered, slower: account p95 23 ms | **survived**: order p95 35 ms (baseline 21 ms), 0 errors | none needed |
| **Cold database** (stopped, restarted 3 s later) | **27 of 312 probes answered 503** ("I could not place that order. Nothing was reserved" / "unavailable"), then normal | the order route refused safely (503, nothing reserved) for ~3 s, then **survived** | **2.5 s** after the database was back |

Invariants after the run: hold. Dropped iterations 0.
At the quarter-core approximation (`stress-db0.25`) the system is already saturated at the baseline (account p95 4 s at 300 req/s), so the phases there show degradation stacked on overload; the cold database
answered 20 of 30 order probes with 503 and recovered 6.7 s after the restart. I do not draw per-case conclusions from that run.
**Before the pool-error fix, the cold-database case ended the process (item "found" 2).** That was a failure of the stress case I had set up to pass.

## 7. Price-gap cases

`step-50-gap-db1`: a new close lands overnight, 20% above the old one, on four of the eight symbols, past the 5% ceiling every queued order reserved for; 100 low-cash players (60 or 70 dollars) queued
an order on the first of them.

| | count |
|---|---|
| Topped up from buying power at the open | **495** |
| Rejected at the open, `insufficient-buying-power-at-open`, full reservation released | **50** (the 60-dollar players; the 70-dollar ones could pay the 10.50 top-up) |
| Admitted without change | the rest of the 1,000 |
| Invariants after the run (Part 4's, plus the leaderboard reconciliation in the integration tests) | **hold**: none negative, quantities add up, cash adds up for every account (the low-cash ones against their own starting cash) |

Cases with exact amounts, each followed by the invariant check, are in `orders-queued.int.test.ts` (27 tests): a gap inside the ceiling needs no top-up; a gap above tops up 210.00 on 10 shares and the order fills at the new price;
a top-up that is the exact buying power is admitted and one cent short is rejected; a stale or missing price at the open rejects and releases.

## 8. The multixact error

**Not reproduced.** `multixact.json`: 150 s, 60 concurrent order lifetimes on 20 contended accounts, each running the steps that raced in CI's failure at once on the same order (two admissions, a fill and its duplicate,
a second fill, a cancel request, a cancel confirmation, a release): **33,111 lifetimes, 264,888 operations, 0 multixact errors, 0 errors of any kind**, quantities and buying power clean afterwards. A first run, made
while a stray throttle was running (and so with more interleaving): 13,114 lifetimes, 104,912 operations, also 0.
What this does not show: the error was seen once on **Postgres 17** (`postgres:17-alpine`, a floating tag); this machine has Postgres 16.15 and I could not install 17. Not reproducing here says nothing about 17.
The new admission step takes `FOR UPDATE` on the order row; the race above includes it, and it did not provoke the error.

## 9. Bulkhead: moderation down

`stress-db1`, order path latency (probe p95, which is what a player placing an order sees) with the moderation provider hanging to its 2 s timeout:

| Before (baseline phase) | During (moderation down) | After (recovery phase) |
|---|---|---|
| **21 ms** | **22 ms** | 22 ms |

k6's own order p95: 20 ms, 20 ms, 20 ms. Account poll p95: 8 ms, 8 ms, 8 ms. The handle saves themselves took their 2 s timeout and ended in review. Held in code by `bulkhead.test.ts` (moderation opens no trading pool, a hung
provider costs its own request at most 2 s, and with the switch off no request is made at all) and by the rule that trading never imports moderation (ADR-0027).

## 10. Cost of each cloud run

| Run | Vercel Active CPU | Provisioned memory | Neon CU-hours | Notes |
|---|---|---|---|---|
| (none) | 0 | 0 | 0 | No cloud run was made. `cost/usage` is not touched; it waits for the weeks 42-46 dashboard readings you will paste |

The brief puts the Hobby daemon quota at 5 Active CPU-hours. `content/architecture/*.json` (the sweeper's `costNote`) says 10, and `cost/allowances.json` has no daemon entry. I changed neither; one of them is wrong.

## 11. `check:arch`, the new rules, and each failing fixture

`pnpm check:arch` on this branch: `check:arch passed: 12 checks held, 63 rules enforced` (61 at the start of the part).

New ADL rules (`architecture/adl/structure.adl`):

- `ASSERT(ONLY apps/web/app/lib/degradation READS BULLPEN_OFF)` (the kill switches' one reader). The existing secret check enforces it; it caught four of my own tests that named the variable (and a fifth that named the trading database variable, which another rule keeps in one place); they now use `degradation/testing.ts`.
- `ASSERT(NO apps/web/app/api/leaderboard, apps/web/app/api/stock-prices, apps/web/app/api/prices, apps/web/app/lib/trading/reads IMPORTS apps/web/app/lib/trading/orders)` (reads never take the order pool).

Failing fixture for the second (`isolation-imports-violation`, run through `checkImportBoundaries`, the shared failure format):

```
✗ import boundaries: NO apps/web/app/api/leaderboard, apps/web/app/api/stock-prices, apps/web/app/api/prices, apps/web/app/lib/trading/reads IMPORTS apps/web/app/lib/trading/orders
  where:   apps/web/app/api/leaderboard/route.ts:1
  why:     apps/web/app/api/leaderboard/route.ts imports ../../lib/trading/orders/pool.js, which is apps/web/app/lib/trading/orders, and code in apps/web/app/api/leaderboard, apps/web/app/api/stock-prices, apps/web/app/api/prices, apps/web/app/lib/trading/reads may not (structure.adl:7).
  fix:     Remove the import. If apps/web/app/api/leaderboard/route.ts needs what apps/web/app/lib/trading/orders does, move that into code both may import, or ask for a new decision (an ADR).

✗ import boundaries: NO apps/web/app/api/leaderboard, ... IMPORTS apps/web/app/lib/trading/orders
  where:   apps/web/app/lib/trading/reads/leak.ts:1
  why:     apps/web/app/lib/trading/reads/leak.ts imports ../orders/pool.js, which is apps/web/app/lib/trading/orders, and code in ... may not (structure.adl:7).
  fix:     Remove the import. ...
```

The passing fixture (`isolation-imports-ok`) and the shape test are in `isolation-rules.test.ts`. The `BULLPEN_OFF` rule uses the existing secret check, whose failing fixtures are `secret-violation`.

**Two things in `check:arch` I want you to look at:** (1) turbo's boundary check treated k6's built-in modules (`import http from "k6/http"`) as missing npm packages; I put turbo's per-import comment `@boundaries-ignore` (with the reason) on those 8 import lines in `architecture/fitness/load/`
and did not change the check. (2) My first harness imported `apps/web` source from `architecture/fitness`; the same check refused it (ADR-0003), correctly, so the stand-in server now lives in `apps/web/scripts/` and everything
that touches market-data stays in the run.

## Records, and what the publish PR has to do

- **The built Part 5 moment and its explorer content are staged, not wired.** `architecture/calm/staged/part-05.architecture.json` (passes `calm validate --strict` against the pattern: no errors, no warnings) and
  `content/architecture/staged/part-05.json` (status `planned`). The timeline still points Part 5 at the prediction and `current-moment` is the bonus, so the live architecture page keeps showing the prediction. Wiring them now
  made eight landing tests fail, because they (correctly) encode "Part 5 is still the prediction until it is published", and would have changed the public page before the publish date. `staged-part-05.test.ts` checks the two
  files agree. **The publish PR:** move the staged content over `content/architecture/part-05.json` with status `built`; move the moment to `architecture/calm/moments/`; point the timeline's `part-05` at it (name, description,
  `detailed-architecture`); set `current-moment`; update the landing tests that name Part 5 as planned (`architecture.test.ts` carry-forward, `calm.test.ts`, `architecturePage.test.ts`, `costView.test.ts`); flip the four ADRs from Proposed if you accept them.
- **Latency budgets are controls on the trading-app node**: order p95 1,000 ms at the 9:30 step, connection waits (reads 2 s, orders 5 s), stream lifetime 270 s against Hobby's 300 s, and 100 admissions a pass in 8 s. The schema took a free-form `budget` object in the control's config. Controls held by a test or a k6 threshold name that in
  their description; only the two held by a check (`import-boundary-check.ts`, `secret-check.ts`) carry `enforced-by`, because the landing maps `enforced-by` to a check the snapshot can report on (I added `import-boundary-check.ts` to that map).
- **The title.** `content/series.json` keeps the card `title` within its 28-character budget ("The market open") and carries the full post title in `headline`, as the bonus and Parts 1 to 4 already do: "The market open: where the work waits". `plannedDate` is still 2026-11-23. README and the `costView.ts` comment use the full title.
- **The Part 4 rules snapshot is refreshed** (`architecture/reports/part-04/`) with the two new rules, as the bonus did for its own.

## Not done, and what I need from you

- **Cloud runs.** Create the Neon branch and hand me its URL, and say which Vercel preview to use, and I will run `cloud.js` (5 req/s of reads, 1 order/s, at most 5 new streams/s for 60 s) and the database pressure case with the abort thresholds in `architecture/fitness/load/README.md`. I will stop on the first threshold.
- **Turbo.** `pnpm lint`, `pnpm test` and the rest could not run through turbo in this container (`Exec format error` spawning the package manager, also on `main`'s code and before my changes). I ran every task per package with `pnpm -r` instead. CI runs the real turbo; its result is in the PR.
- **Kill switches are an environment variable.** `BULLPEN_OFF` is read from the environment, so turning a switch on or off is an env change and a redeploy, which is yours to make. Names: `handle-moderation`, `leaderboard-refresh`, `price-stream`.
- **`DATABASE_URL_TRADING` host.** Both pools use the existing variable. The code logs once if its host is not a Neon `-pooler` host; I could not see which it is.
