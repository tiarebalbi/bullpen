# Decision 1: what drives the sweep

Date of the measurement run: 2026-10-21T01:40:30Z (2026-10-20, 18:40 local). Commit: the one that adds `architecture/fitness/src/measure/sweeper.ts`
(its output is in `raw/sweeper-measure-output.txt`, the numbers in `raw/sweeper-measure.json`). Command (from `architecture/fitness`):

```
PART4_REPORT_DIR=<repo>/architecture/reports/part-04/raw pnpm db:measure-sweeper
```

**What was measured and what was not.** The daemon option was built and measured on a throwaway Postgres 17 container on my laptop (arm64 macOS,
Node v26.12.0), against the real sweep route (`next start` of the production build) and the real daemon process. Nothing touched Neon, so
the transfer budget guard did not apply and no Neon transfer was used; every row is a test row. **Vercel Queues and Workflows were not
measured**: running either needs a Vercel deployment with the feature enabled, which is a stop condition in the brief (a new integration
or a change that costs money), so their cells below are the documented limits and arithmetic, labelled as such. Nothing here ran on
Vercel's infrastructure: Active CPU on Fluid compute is not the CPU of `next start` on a laptop, so a number measured here is an order of
magnitude, not the bill. Run to run the CPU numbers moved by up to about 2x (three runs: idle tick 0.26 to 0.54 ms, daemon call 1.2 to 1.7 ms);
the file keeps the last run, the ranges below are from all three.

## What the docs say (read 2026-10-20)

| Fact | Source |
|---|---|
| Daemons: public beta, all plans; production deployments only (not previews, not `vercel dev`); no inbound HTTP or TCP; built from a Dockerfile; restarted when they exit or crash | [Daemons](https://vercel.com/docs/daemons), [limits](https://vercel.com/docs/daemons/limits) |
| Hobby quota: 10 Active CPU-hours a month per team; when reached Vercel stops the team's daemons until the first of the next month (UTC) | [Daemons limits, Default quotas](https://vercel.com/docs/daemons/limits#default-quotas) |
| `SIGTERM` on every rollout, **30 s** grace by default (the brief said 10 s), up to 3,600 s | [Daemons, Graceful shutdown](https://vercel.com/docs/daemons#graceful-shutdown) |
| A project whose root directory is a subfolder such as `apps/web` cannot add daemons yet; this project's root is empty and `apps/web` is a service (the docs show services next to daemons) | [Daemons limits, Unsupported features](https://vercel.com/docs/daemons/limits#unsupported-features) |
| Cron on Hobby: once a day, "anywhere between 1:00 am and 1:59 am" | [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| Queues: delay up to 7 days; Hobby includes 1,000,000 operations; push delivery invokes a function | [Queues pricing and limits](https://vercel.com/docs/queues/pricing) |
| Workflows: no maximum `sleep`; Hobby includes 50,000 events and 1 GB written a month; a step is at least 3 events (`step_created`, `step_started`, `step_completed`) | [Workflows pricing](https://vercel.com/docs/workflows/pricing) |
| One-time Schedules on Hobby: jitter always 15 minutes | Vercel documentation search, "Schedules.create" (no dedicated pricing page read) |
| Neon: scale to zero after 5 minutes of inactivity (fixed on Free; `cost/allowances.json` records 5 minutes for the Launch plan, the console shows this project's setting) | [Scale to zero](https://neon.com/docs/introduction/scale-to-zero), `cost/allowances.json` |

## Measured: the daemon option

| Measurement | Result |
|---|---|
| One tick, in process, no orders: statements / wire bytes / client CPU | 6 / 2,481 B / 0.277 ms (0.26 to 0.54 over three runs) |
| One tick, 5 open orders that cannot fill | 11 / 4,566 B / 0.846 ms (0.72 to 0.87) |
| The sweep route, end to end (`next start`), server CPU per call, idle / 5 open orders | 1 ms / 1.133 ms (0.78 to 1.0 / 0.82 to 1.17); response p50 2.276 ms / 3.545 ms (a local database: no network) |
| The daemon process, CPU per call (local HTTP, connection reused) | 1.58 ms (1.2 to 1.7), over 500 calls in 20 s |
| The daemon asleep between calls, CPU over 20 s | 0 ms |
| Connections Node's `fetch` opens for 3 calls 6 s apart | 3 (so every call at 5 s or slower opens one) |
| Client CPU per call: HTTP reused / HTTPS reused / HTTPS new connection / HTTP new connection | 0.157 / 0.165 / 0.734 / 0.246 ms (self-signed certificate, so a floor) |
| Real daemon at the 5 s cadence: time from an order being past the accept timeout until it left `accepted` | min 556 ms, p50 2,314 ms, max 4,856 ms over 8 trials |

Putting those together for the daemon at its production cadence (each call a new HTTPS connection, so the daemon's own CPU is about
1.58 + 0.57 = 2.1 ms a call):

- **Active CPU of the daemon**: 518,400 calls in 30 days at 5 s is 0.31 CPU-hours, 3.1 % of the team's 10 hours; at the 15-minute idle ceiling, 3,060 calls a month, about 7 s. The quota is not the constraint.
- **Active CPU of the route** at about 1.1 ms a call: 0.16 CPU-hours of Hobby's 4-hour Fluid compute allowance for the 5 s cadence (4.0 %).
- **Function invocations**: 518,400 a month at 5 s, 52 % of Hobby's 1,000,000. This is the constraint the adaptive cadence is for.
- **Postgres wire bytes** at 5 s with orders open: about 2.4 GB a month (Launch includes 500 GB); idle at 15 minutes: about 7.6 MB. TLS adds a few percent.

## Computed: calls and Neon awake time under each idle ceiling

Calls come from the ticker's own wait function run on a virtual clock for 24 hours (the real `run`, a stub `fetch` and `sleep`).
Neon awake time assumes each call reaches Postgres and keeps the compute up for 5 minutes (the union of those windows), at 0.25 CU and
$0.106 a CU-hour (`cost/allowances.json`). This is a model of Neon, not a measurement of it: the console's CU-hours are the check once a daemon runs.

**No order all day**

| Idle ceiling | Calls a day | Calls a month | Share of Hobby's 1,000,000 invocations | Neon awake h/day | CU-hours/month | USD/month (compute alone) |
|---|---|---|---|---|---|---|
| 1 min | 1,442 | 43,260 | 4.3 % | 24 | 180 | 19.08 |
| 5 min | 292 | 8,760 | 0.9 % | 24 | 180 | 19.08 |
| 15 min | 102 | 3,060 | 0.3 % | 8.17 | 61.3 | 6.5 |
| 30 min | 55 | 1,650 | 0.2 % | 4.25 | 31.9 | 3.38 |

**Orders open for one hour a day**

| Idle ceiling | Calls a day | Calls a month | Share of Hobby's 1,000,000 invocations | Neon awake h/day | CU-hours/month | USD/month (compute alone) |
|---|---|---|---|---|---|---|
| 1 min | 2,102 | 63,060 | 6.3 % | 24 | 180 | 19.08 |
| 5 min | 1,002 | 30,060 | 3.0 % | 24 | 180 | 19.08 |
| 15 min | 750 | 22,500 | 2.2 % | 8.9 | 66.8 | 7.08 |
| 30 min | 630 | 18,900 | 1.9 % | 5.13 | 38.5 | 4.08 |

**An order is always open** (every ceiling gives the same result, because the cadence is 5 s): 17,280 calls a day, 518,400 a month, the compute awake all day.

**The route fails all day**: the failure ceiling is 5 minutes, so 1,442 calls a day at a 1-minute ceiling and 292 otherwise. Whether a failing call reaches Postgres depends on the failure, so there is no Neon figure.

**The finding that changes the design.** Anything that calls Postgres every five minutes or faster keeps a Neon compute awake: with the
60-second idle ceiling I first drafted, a project with no orders at all would use 180 CU-hours a month, about $19 of compute. That is why
ADR-0018's idle ceiling is 15 minutes (about 8.17 awake hours a day with no orders, 61.3 CU-hours, about $6.5) and not 60 seconds. It is
still money. A delayed queue message or a workflow `sleep` touches Postgres only when an order's timer fires, so with no orders they cost
Neon nothing; with orders open, the compute is awake anyway. That last sentence is reasoning from the documented behaviour, not a measurement.

## Cost per order, measured (local Postgres, no TLS)

| | Part 3 one-transaction buy | Lifecycle: submit, working, one fill, release |
|---|---|---|
| Statements per order | 7.07 | 34.07 (includes one tick for the order) |
| Wire bytes per order | 2,022 | 11,499 |
| Rows written per order | orders 1, ledger 2, positions 1 | orders 1, reservations 1, fills 1, order_events 4, ledger 2, positions 1 |
| Table and index bytes added per order | 1,229 | 4,260 |

The lifecycle writes about 5.7 times the wire bytes of the Part 3 buy and about 5 times the statements. Each extra fill (a partial one) adds
a fill row, an event row, two ledger rows and a position update. Workflow events, queue operations and function invocations per order for options b and c are not measured; see below.

## The three options, side by side

| | a) Daemon ticking a route (built, measured) | b) Delayed Queues message per order (not built, not measured) | c) Workflows `sleep` (not built, not measured) |
|---|---|---|---|
| How a stuck order is found | the sweep reads Postgres for orders past a deadline | a message per order returns when its delay is due and a function checks the order | the workflow wakes after `sleep` and checks |
| How fast | active: 556 to 4,856 ms measured (p50 2,314 ms), at most one tick (5 s); idle: at most the idle ceiling (15 min) plus the timeout | the delay chosen, up to 7 days (docs); precision not measured | no maximum `sleep` (docs); precision not measured |
| Active CPU a day | measured: about 37 s of daemon CPU at the 5 s cadence all day, 0.22 s idle at 15 min | not measured | not measured |
| When the quota runs out or the process stops | daemons stop until the 1st (UTC); orders keep their state; nothing finds a stuck order until then; a stopped process is restarted and the next tick finishes the work (tested) | Hobby includes 1,000,000 operations a month (docs); behaviour beyond it not read | Hobby includes 50,000 events a month, at least 3 per step (docs); behaviour beyond it not read |
| Per order (documented minimum, not measured) | no per-order cost beyond the ticks | at least 4 operations (send, notify, receive, delete), 8 if the send carries an idempotency key | at least 3 events per step; 5 steps (reserve, dispatch, wait, settle, release) is at least 15 events, so about 3,300 orders a month on Hobby |
| Testing | unit tests with a fake clock and a stub server, a SIGTERM test and a tick that dies, and a local Docker run; not in previews | not tested | not tested |
| Moving parts it adds | a daemon, a route, a secret, a contract | a topic, a consumer route, per-order messages Postgres does not hold | the Workflow SDK, an outbox and a dispatcher (the handoff cannot commit with Postgres) |
| Lines of code | 120 lines (`main.ts` 22, `ticker.ts` 98); route and auth 45 lines (`route.ts` 28, `sweepAuth.ts` 17); the sweep and tick 161 lines (`sweep.ts` 118, `tick.ts` 43), plus the two simulated venues, 239 lines in `venue.ts` | not built | not built |

## The container, and what happens when the daemon stops (2026-10-21)

Run as the image it ships in (`apps/sweeper/Dockerfile`) against a local Postgres and the real sweep route (`pnpm --filter @bullpen/fitness-checks db:measure-sweeper-docker`, output in `raw/sweeper-docker-output.txt`, 2026-10-21T04:51Z):

- a stuck order (past the 30 s accept timeout) was found in 1.2 to 5.0 s, median 3.1 s, over 8 trials at the 5 s cadence;
- with nothing open and the idle ceiling set to 30 s for the run (it is 15 minutes in production), a stuck order was found in 8.3, 10.1 and 10.1 s, always inside the ceiling;
- `docker stop` (SIGTERM, 30 s grace) stopped the container in 127 ms with exit code 0, so the grace is not the limit; a call in flight is abandoned and the next sweep finishes it.

**When the 10 Active CPU-hour quota runs out**, Vercel stops every daemon of the team until the first of the next month (UTC). Nothing is lost: orders keep their state in Postgres, and until the daemon is back
nothing finds an order that is stuck, so a stuck order's buying power stays reserved. Whoever restarts it, or the first month's day after, gets the recovery for free: every step of the sweep is conditional on the order's state.
The test `after an outage: the daemon stopped for days` (`orders-tick.int.test.ts`) ages five orders by three days (never handed to the venue, working with no fillable price, cancel requested and never confirmed, filled with the release never run,
cancelled with the release never run), runs the ticks that follow, and checks that all five end terminal and released, nothing is flagged (a cancel flagged as unconfirmed is cleared when the venue confirms it), the buying power is what it should be, the
invariants hold, and one more tick changes nothing. At the measured cost the quota is not what limits the daemon (3.1 % of it at the 5 s cadence all month), so this is the case of another project on the team using it up.

## Workflows: not built in Part 4, and why (stated explicitly, 2026-10-20)

I did not build Workflows for Part 4 and I did not measure it. The report carries the analytical comparison and the cost model above and nothing
measured for it. The reasons:

- **The baseline passes every test.** The Postgres state machine, the sweep and the simulator pass the rule tests, the exhaustive and seeded races (0 failures in
  8,346 and 1,500 runs), the duplicate-fill, crash and failing-release experiments, and the tick that dies mid-run. Nothing found so far needs a durable engine to be correct.
- **The one gain Workflows could show is cost at idle, and it cannot be measured without a deployment.** The measured cost of the baseline is small in CPU and
  invocations; its real cost is the Neon compute a polling daemon keeps awake, which the model puts at about $6.50 a month at a 15-minute idle ceiling. A `sleep` or a queue timer
  would avoid that. Checking it takes a Vercel deployment with Workflows enabled running against a database, which is a stop condition in the brief (a new integration, and it
  writes to Neon); Workflows' own metering (events, data written) exists only on Vercel.
- **The handoff would be new code that is itself a risk.** Postgres and Workflows cannot commit together, so Workflows needs an outbox, an idempotent dispatcher and the handoff
  experiment (order committed, workflow start fails). That is the experiment the brief marks "only if Workflows is used"; it was not run, and it is not claimed.

What this means for the post: the claim that this needs a saga because of time, not a new service, is supported by the baseline alone, which is a state machine, a sweep and
a driver. It is **not** evidence that Workflows would be worse or better; it is evidence that Part 4 did not need it. If the owner wants Workflows measured, it needs a deployment and a yes.

## What I would conclude, and what is open

- The daemon works as a baseline, and its own CPU and the route's are small. Its real costs are the invocations at the 5 s cadence and the Neon compute it keeps awake when idle.
- Whether Workflows or a queue timer beats it cannot be said from this run: I have not measured them. The post's claim, that the lifecycle needs a saga because of time and not a new service, holds so far in this sense: every step is one transaction in `trading` and the sweep is a plain function. The daemon adds a driver, not a service with its own data.
- Open: Neon's scale-to-zero setting on this project (console), the real CU-hours once anything polls, and the Queues numbers, which need a deployment and your yes. Workflows is recorded above as not built.
