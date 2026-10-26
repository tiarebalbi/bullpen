# Part 4: facts for the post

Fifteen short sections, each ready to paste. Every number names the file it comes from and the command that reproduces it (commands run from the repo root unless a directory is
given). Anything not read or not run says so. Branch `post-04-saga`; the reports it cites are in `architecture/reports/part-04/`.

## 1. Where the lifecycle rules landed as tests

Commit `43267d9` (2026-10-20): `feat(part-04): the order lifecycle as a Postgres state machine, with a seeded fill simulator, a sweep and the invariants`. What git shows is that the
rules, the decision and the tests landed **together** in that one commit: ADR-0017 (`architecture/adr/0017-order-lifecycle-as-a-postgres-state-machine.md`, 137 lines, with "The simulator's
ordering rules"), the lifecycle code (`packages/db-trading/src/orders/lifecycle.ts`), the migration, and the three test files `orders-lifecycle`, `orders-race` and `orders-recovery`
under `architecture/fitness/src/db-integration/`. I wrote the ordering rules before the code while working, but the history does not show a commit with the rules alone, so the post should not claim one.
Source: `git show --stat 43267d9`.

## 2. The states

Source: `TRANSITIONS` in `packages/db-trading/src/orders/states.ts`, the lifecycle functions in `lifecycle.ts`, and ADR-0017.

| State | Entered when | Can move to |
|---|---|---|
| accepted | an order is submitted: buying power is reserved at a ceiling 5 % above the price and the order is inserted, in one transaction | working, rejected, cancel_requested, partially_filled, filled |
| working | the venue has the order (the sweep handed it over) | partially_filled, filled, cancel_requested |
| partially_filled | a fill is booked and quantity is still open | partially_filled, filled, cancel_requested |
| cancel_requested | the player asked to cancel; the venue has not confirmed yet, so fills can still arrive | cancel_requested, cancelled, filled |
| cancelled | the venue confirmed the cancel with an effective time | cancelled (a late fill), filled (late fills bring the cancelled quantity to zero) |
| filled | fills booked make the quantity whole (also from a cancel that lost the race) | none |
| rejected | the venue refused the order (for example, its price was withdrawn); the reservation comes back at once | none |

`orders-player.int.test.ts` produces each of the seven from the lifecycle itself and checks each view against the account-view contract
(`pnpm --filter @bullpen/fitness-checks test:db src/db-integration/orders-player`).

## 3. Decision 1: what drives the sweep

**Choice:** a daemon that calls an authenticated route, ticking every 5 s while an order is open and backing off to every 60 minutes when none is (ADR-0018 set 15 minutes; ADR-0021 raised it on 2026-10-21, see the flip line below).
**Why:** it is the option I could build and measure without a new integration, every step of the sweep is conditional on the order's state so a stopped or crashed daemon only delays recovery
(test: `after an outage: the daemon stopped for days`), and its own cost is small: about 2.1 ms of daemon CPU a call, 518,400 calls a month at 5 s all month is 0.31 CPU-hours of the team's 10.
**Why Workflows was not built (and not measured):** the baseline passed every test, the one gain a Workflows `sleep` could show is Neon idle cost, which cannot be measured without a Vercel deployment with
Workflows enabled writing to Neon (a stop condition), and Workflows needs an outbox and a dispatcher that would be new risk. The post says "Part 4 did not need it", not "Workflows would be worse".
**What would flip it:** the line is the sweeper keeping Neon awake more than about 8 hours a day on average. At the first ceiling, 15 minutes, the model said 8.17 hours a day with no orders (61.3 CU-hours, about $6.50 a month of compute at 0.25 CU and $0.106 a CU-hour), already over the line, so on 2026-10-21 the idle ceiling went to 60 minutes (ADR-0021, Accepted): **2.34 hours a day, 17.5 CU-hours, about $1.86 a month** with no orders, and 3.17 hours, 23.8 CU-hours, about $2.52 with orders open an hour a day. Over 8 hours a day on the 60-minute ceiling would mean orders open for most of the day, and then a delayed message or a `sleep` that touches Postgres only when an order's timer fires is the driver to measure. The line is a decision the owner approved on 2026-10-21; the hours are computed (`pnpm --filter @bullpen/fitness-checks cadence-model`, `raw/cadence-model.json`), not a Neon reading.
Source: `decision-1-sweep-driver.md` (tables "Computed", the 2026-10-21 update, and "Workflows: not built"); `cost/allowances.json`.

## 4. The simulator's ordering rules

Written in ADR-0017, section "The simulator's ordering rules" (the same commit as section 1, `43267d9`, with the same caveat): a fill has a unique id and a venue time; delivery is at-least-once and unordered; a cancel request is not a cancel; the
venue confirms it with an effective time and every fill executed before that time is owed wherever it arrives; a booked fill is never undone; a duplicate fill id changes nothing; release is a separate step, allowed only after the effective time plus
a 30 s late-fill window and retried by the sweep; about 10 % of fills are partial. The derived venue the app uses (fill id `<order>:<fills so far>`, a seeded partial, a 5 % price ceiling, a 5-minute stale limit for a live price and, from ADR-0024 (Proposed), no age limit of its own for an end-of-day price) is `packages/db-trading/src/orders/venue.ts`.

## 5. The race

**Result:** 0 failures in 8,346 exhaustive interleavings and in 1,500 seeded random runs (1,985 crashes injected, 1,676 waves with more than one event in flight, 915 duplicate deliveries). Source: `raw/race-exhaustive-summary.json`, `raw/race-random-summary.json`;
command (from `architecture/fitness`): `PART4_REPORT_DIR=<repo>/architecture/reports/part-04/raw PART4_RACE_SEEDS=1500 pnpm test:db src/db-integration/orders-race --reporter=verbose` (2026-10-20, 17:04 local).
**Does the check fail when something is wrong?** Yes: I made the lifecycle drop any fill that arrives after the order is cancelled (one line, reverted) and 4,330 of the 8,346 runs failed. That run was on an uncommitted tree and its full output was not kept; only the line `EXHAUSTIVE runs=8346 failures=4330` is recorded in `experiment-1-cancel-vs-fills-race.md`.
**What it does not cover:** one account and one 10-share order per run; plans of up to three (exhaustive) or four (random) fills; the venue is the simulator, not a real exchange; delivery delay beyond the stated 30 s late-fill window; many accounts contending at once (Part 3's contention test covers the buy path, not this lifecycle); and Neon (everything ran on a throwaway local Postgres 17).

## 6. Experiments 2 to 4, and the failing release

- **2, a duplicate fill after a lost acknowledgement:** the account after the retry equals a control that saw the fill once (ledger, position, fills, reservation, buying power, state); a venue that delivers every fill twice leaves the account as if once. `experiment-2-duplicate-fill.md`.
- **3, a crash after a side effect and before success is recorded:** every step stopped at every named boundary, before and after its commit, then run again: one reservation, one fill, one pair of ledger entries, one position, one release. `experiment-3-crash-after-side-effect.md`.
- **4, a compensation that keeps failing:** the release was made to fail on five sweeps; the order stays `cancelled`, is flagged `release-failing` once (on the third failure), no money is lost (it is still held as reserved), and the next successful sweep releases 650 and clears the flag. `experiment-4-failing-compensation.md`.
Commands: `pnpm test:db src/db-integration/orders-recovery src/db-integration/orders-lifecycle --reporter=verbose` from `architecture/fitness`.
**The failing release in one paragraph:** nothing pages anyone. The flag is a column on the order; surfacing it (a count on a status route, an alert) is not built. While it is stuck the invariants hold, because money a reservation holds counts as reserved.

## 7. Sign-in

**Option chosen:** Neon's managed auth (Better Auth underneath), GitHub as the only provider; a player is shown as "Player" plus four hex characters of a hash of their id, never a GitHub username (ADR-0020, Accepted 2026-10-21). I first proposed a self-hosted Better Auth with its own schema and role; the owner chose the managed one, which was already enabled.
**Evidence:** the verifier checks the session's access token against the project's public keys (`jose`) and takes the user id from `sub`; tests sign tokens with a key made for the test (`apps/web/app/lib/auth/token.test.ts`, `player.test.ts`); `players.int.test.ts` shows one account per user under concurrent first sign-ins and a handle that never names the person; the order routes answer 401, 503 (no sign-in here) and the rest as tested in `apps/web/app/api/orders/route.test.ts` (13 tests); an e2e test shows the signed-out and no-sign-in states (`apps/web/e2e/trading-orders.spec.ts`).
**Not tested:** a real GitHub sign-in on `bullpen-app.tiarebalbi.com`. It needs the owner's `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` in Vercel production and a sign-in by the owner. Two Neon console settings are the owner's to confirm (Allow Localhost off for production; email and password sign-up off). The cost of Neon Auth on this plan was not read.

## 8. Bytes per polling subscriber

Measured on 2026-10-21 (local Postgres, no network; the response is what the route sends). Source: `raw/orders-measure.json`; command: `pnpm --filter @bullpen/fitness-checks db:measure-orders`. The screen polls `GET /api/orders` every 3 s while an order is open and every 15 s otherwise, and not while the tab is hidden.

| Orders in the account | JSON bytes | gzip bytes | gzip per hour at 3 s | gzip per hour at 15 s |
|---|---|---|---|---|
| 0 | 213 | 153 | 183,600 | 36,720 |
| 1 | 751 | 345 | 414,000 | 82,800 |
| 7 | 3,409 | 562 | 674,400 | 134,880 |
| 50 (the most the route returns) | 22,461 | 1,844 | 2,212,800 | 442,560 |

(The per-hour columns are gzip bytes x 3600 / seconds. Gzip sizes move by a few bytes between runs because ids and timestamps differ.) Whether Vercel compresses this response, and the transfer a real subscriber costs on Neon and Vercel, were not measured.
**Per poll, the database:** an idle poll sends 7 SQL statements (advance the player's orders, then read the account).

## 9. Contract tests

Eight tests for the account-view and order-request contracts (`packages/contracts/src/orders.test.ts`), two for the sweep tick (`sweep.test.ts`), plus every account view the lifecycle produces in `orders-player.int.test.ts` being validated against the schema (`validateAccountView`), plus 13 route tests (`apps/web/app/api/orders/route.test.ts`) and the sweep route's tests.
Command: `pnpm --filter @bullpen/contracts test`.
**One failing example, for the record** (`orders.test.ts`): a booked order whose `filledQty` arrives as the number 4 instead of the string "4.00000000" is rejected, and the error names the field: `/filledQty/`. A real failure the contract caught while building: the view first sent money with 16 decimals where the contract allows 8, and the integration test failed until the view cast to `numeric(20,8)` (`packages/db-trading/src/orders/view.ts`).

## 10. Records

- ADR-0016 (only an Accepted decision authorizes naming an external system in the model): Accepted. ADR-0017 (the order lifecycle): Accepted. ADR-0018 (the sweeper): Accepted. ADR-0019 (leaderboard cash counts reserved buying power): **Accepted** by the owner on 2026-10-21. ADR-0020 (sign-in is Neon's managed auth): **Accepted** by the owner on 2026-10-21. ADR-0021 (the sweeper's idle wait is 60 minutes, and a flagged order does not hold the fast cadence): **Accepted** by the owner on 2026-10-21. (Source: the Status section of each file in `architecture/adr/`.)
- **The CALM moment:** `architecture/calm/moments/part-04.architecture.json` is the current moment; the explorer data (`content/architecture/part-04.json`) is kept in step with it and the `explorer consistency` check passes (`pnpm check:arch`: 10 checks, 47 rules).
- **Neon Auth is in the model:** with ADR-0020 Accepted, the Neon Auth node and the trading-app-to-Neon-Auth edge are in `architecture/calm/moments/part-04.architecture.json` and the explorer (`content/architecture/part-04.json`); `pnpm check:arch` still passes (ADR-0016's rule: an external system is named only under an Accepted decision). The cost note on the node says the cost is pending.
- **The Order Saga component** that week one predicted is **predicted, not built**: the lifecycle is one transaction per step inside the trading schema, with no separate saga service. The week-one prediction tag (`predictions-week-1`) is untouched.

## 11. What the app shows

A signed-in player gets a market-buy ticket (the rail on a desktop; on a phone a bar that opens the ticket as a sheet), a portfolio, an orders list that draws all seven states ("cancel requested" has its own words, glyph and border and never says money is back), and the leaderboard marks their row. A visitor who is not signed in gets an invitation to sign in. Where sign-in does not exist (previews) the ticket says so. There is no Sell, no Limit, no chart and no header equity or rank, because none of them has data.
Screenshots (1440 and 390, produced from fixtures made in the test file, not page data): `architecture/reports/design-review/trading-app/app/` (`trading-dark-*.png`, `trading-light-*.png`, `orders-seven-states-*.png`, `ticket-sheet-open-390.png`, `ticket-rail-1440.png`, `ticket-signed-out-*.png`, `portfolio-empty-*.png`, `order-ticket-off-*.png`, `trading-colour-blind-*.png`) beside the design frames in `architecture/reports/design-review/trading-app/design-*.png`. The review is `architecture/reports/design-review/trading-app/README.md`. axe: zero violations in both themes at both widths (`pnpm --filter @bullpen/web exec playwright test e2e/trading-orders.spec.ts`).

## 12. Cost lines changed

None in `cost/allowances.json` on this branch (`git diff main -- cost` is empty). What changed is `docs/data-sources.md`: Neon Auth is listed as in use (+15 lines, 2026-10-21). The cost of Neon Auth, Neon's CU-hours and transfer since the sweeper and orders exist, and Vercel's usage were **not read**: those dashboards are the owner's to read, so every such cell is "pending". The figures this branch adds to the ledger's story are computed or local: the daemon's CPU, the invocations, and the CU-hours table in section 3.

**Cost per order, measured locally (40 market buys of 10 shares, `raw/orders-measure.json`, `db:measure-orders`, 2026-10-21):**

| | Per order |
|---|---|
| SQL statements, place and poll until filled (includes one account read) | 39.8 |
| SQL statements in the POST alone | 31.1 |
| Rows written (Postgres counters) | 17.6 |
| WAL bytes | 6,274 |
| Polls until filled after the POST (34 of 40 orders needed none, 4 needed one, 1 two, 1 three) | 0.23 |
| Function invocations: the POST plus the polls | 1.23 |
| Neon CU-hours and transfer per order | pending (not measured; dashboards not read) |

Daemon Active CPU a day, locally: about 37 s at the 5 s cadence all day, about 0.07 s at the 60-minute idle ceiling (32 calls x about 2.1 ms; the earlier 0.22 s was the 15-minute ceiling; `decision-1-sweep-driver.md`, "The three options"); not a Vercel Active CPU reading.

## 13. Not tested, and why

- **The sweeper's first production sweep.** The `daemons` key is in `vercel.json` (the owner's yes, 2026-10-21) but a daemon only rolls out when a deployment becomes production, so until this branch is merged and its deployment is live nothing has run there, and no production sweep has been observed by this report. It needs `SWEEP_SECRET` on the web service and `SWEEPER_TOKEN` (the same value) and `SWEEPER_TARGET_URL` on the daemon. The figures the yes was given on: idle ceiling 60 minutes, 32 calls a day, 2.34 awake Neon hours a day, 17.5 CU-hours and about $1.86 a month of compute at 0.25 CU (computed, not read from Neon); with orders open an hour a day 457 calls a day, 3.17 hours, 23.8 CU-hours, about $2.52; with an order always open 17,280 calls a day (518,400 a month, about 52 % of Hobby's 1,000,000 invocations), the compute awake all day, 180 CU-hours, about $19.08.
- **Vercel Queues and Workflows:** not built, not measured (a deployment and a yes are needed).
- **A real sign-in** and any real order against Neon: needs the owner's settings and a sign-in; nothing in this branch has written to Neon.
- **Neon and Vercel dashboards:** CU-hours, transfer, invocations as billed and Active CPU as billed: not read.
- **A real exchange:** the venue is a seeded simulator.
- **Lighthouse for the trading app, and a long browser session at the 3 s cadence:** not run; the cadence is tested as a function.
- **Two landing end-to-end tests** (`rules-adl.spec.ts`, "a deep link to #structure-adl opens it") fail intermittently under `turbo` and passed every time outside it. I spent a time-boxed 20 minutes, could not reproduce it (CPU load, slowed scripts, hash set before hydration) and did not change the tests; the write-up and what to capture if it appears in CI is `landing-deep-link-flake.md`.

## 14. A bug that passed every test: stock buys cancelled after 15 minutes

**What happened (in production, reported 2026-10-22).** Every stock market buy was cancelled by the sweep 15 minutes after it was placed. Three real orders, **AMZN 90, V 12 and AAPL 3**, were cancelled; their reservations came back
correctly, so no money was lost. These three are as reported by the owner: I did not read the orders table, so their ids and times are not here.
**Why.** The venue fills only at a price at most 5 minutes old (`MAX_FILL_PRICE_AGE_MS`, `packages/db-trading/src/orders/venue.ts`) and the sweep cancels a working order with no fill after 15 minutes (`WORKING_DEADLINE_MS`,
`sweep.ts`). A stock price is a close, stored once a trading day as of 16:00 New York (`apps/market-data/src/ingest.ts`), so it is hours old when anyone trades. Submit used a different rule (the contract's `stale` flag, whose
`valid_until` is the end of the next trading day), so it accepted a buy the venue could never fill.
**Why the tests did not see it.** Every order test seeded its price seconds old (`w.price`, `architecture/fitness/src/db-integration/orders-harness.ts`), with `source = 'test'`; the one case that held an order used a price 6 minutes old. No test had a
price shaped like the ingest's. The first four sections of this file describe that rule as written in ADR-0017, which is accurate: the rule was as decided, and wrong for stocks.
**The fix (ADR-0024, Proposed).** The price contract carries a `kind` (`live` or `end-of-day`); a live price keeps the 5-minute limit; an end-of-day price is fresh while the contract does not flag it stale; one function (`isFillable`) decides in both
the simulator and the derived venue the app runs; `WORKING_DEADLINE` is unchanged. Tests: `orders-end-of-day.int.test.ts` (7 tests; run from `architecture/fitness`: `pnpm test:db src/db-integration/orders-end-of-day`), which fail when the end-of-day
branch is removed (4 of 7, checked by hand) and pass with it. **Not verified:** that the three orders would now fill (they are cancelled; nothing was replayed against Neon), and the fix in production (it needs a deploy, whose build applies the migration to Neon under ADR-0023).
**What it does not close.** Between 16:00 New York and that evening's ingest the previous close is still current under the contract; ADR-0024 records it and leaves it.

## 15. A Postgres error seen once in CI: "new multixact has more than one updating member"

**Observed once, not reproduced.** On 2026-10-26 the `ci` job of run 139, attempt 1 (https://github.com/tiarebalbi/bullpen/actions/runs/40375301401/job/121756619887, head `5fb2b14`) failed one test of 118 in
`architecture/fitness/src/db-integration/orders-race.int.test.ts`: "experiment 1: the cancel races the fills > holds for seeded random plans delivered concurrently, with duplicates and crashes". Postgres 17 (`postgres:17-alpine`, a
floating tag) raised `XX000 new multixact has more than one updating member: 0 3[81794 (keysh), 81794 (nokeyupd), 81799 (nokeyupd)]` (`multixact.c`, `MultiXactIdCreateFromMembers`) on the `UPDATE trading.orders ... WHERE order_id = $1 AND version = $5`
in `bookFill` (`packages/db-trading/src/orders/lifecycle.ts`, via `inTx`). Attempt 2 of the same run, on the same commit, passed that test (job 121762790128), as did `main`'s run 138 and #54's run 137.
**Seed: not recorded.** The test runs seeds 1 to 1500 (`PART4_RACE_SEEDS`) in batches of 10 at once, and it prints a seed only for a failure it collects; this error was thrown out of `deliver`, so the log names no seed. The seed fixes the plan, not the interleaving of the
ten concurrent runs, so it would not reproduce the failure by itself.
**What the code does.** The order update takes no explicit row lock and no savepoint: there is no `SAVEPOINT`, `FOR UPDATE`, `FOR SHARE` or advisory lock in `packages/db-trading`, `apps/sweeper` or `apps/web`. It is an optimistic update guarded by `version`, retried on a
version conflict, `40001` or `40P01` (`inTx`, 12 attempts). The `keysh` member is the implicit key-share lock that inserting a child row (`fills`, `reservations`, `ledger`) takes on its `trading.orders` row through the foreign key.
**Not verified:** the cause. I have not reproduced it, so I do not claim it is a Postgres bug or a flaw in the update; if it shows again, it is a finding, not a flake.
