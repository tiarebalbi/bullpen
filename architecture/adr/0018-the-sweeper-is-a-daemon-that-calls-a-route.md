# ADR-0018: The sweeper is a daemon that calls a route in the Trading App

## Status

Accepted

## Date

2026-10-20

## Summary

A daemon ticks a sweep route; the owner switches it on

## Part

4

## Context

ADR-0017 makes every step of an order's life one transaction in `trading`, and gives the lifecycle a sweep: a
function that finds orders that are stuck (accepted and never handed to the venue, working with no fill, a cancel
nobody confirmed, a release that failed) and moves them on or flags them. The sweep is idempotent and conditional on
each order's state, so any driver can call it. What is still open is what calls it, and how often.

It cannot be a cron job. Vercel's cron on Hobby runs a job at most once a day, and then "anywhere between 1:00 am and
1:59 am" ([Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), read 2026-10-20).

What Vercel's documentation says about the alternatives, read on 2026-10-20:

- **Daemons** ([Daemons](https://vercel.com/docs/daemons), [Daemons limits](https://vercel.com/docs/daemons/limits)):
  public beta on all plans; built from a `Dockerfile`; production deployments only, not previews and not `vercel dev`;
  no inbound HTTP or TCP; Hobby quota of 10 Active CPU-hours a month per team across all its projects, and when it is
  reached "Vercel stops the team's daemons until the first of the next month (UTC)". Time spent waiting does not count
  as Active CPU, but HTTPS requests do (cipher operations). `SIGTERM` on every rollout, **30 seconds** grace by default,
  configurable up to 3,600 (my brief said 10 seconds; the page says 30). "An instance can stop at any time, so make jobs
  idempotent." Vercel restarts instances that exit or crash. "Projects with a root directory such as `apps/web` can't add
  daemons yet": this project's root directory is empty and `apps/web` is a service, which the same docs show alongside
  daemons.
- **Queues** ([Pricing and limits](https://vercel.com/docs/queues/pricing)): a message can be delayed up to 7 days; every
  API call is an operation; Hobby includes the first 1,000,000. Push delivery invokes a function.
- **Workflows** ([Pricing](https://vercel.com/docs/workflows/pricing)): `sleep` has no maximum duration; Hobby includes
  50,000 workflow events and 1 GB of data written a month; a step is at least three events.
- **Schedules** (one-time `single` schedules that dispatch to a queue topic): on Hobby the jitter is always 15 minutes,
  so they cannot be a timer for a stuck order.

## Decision

The sweeper is a Vercel Daemon, `apps/sweeper`, whose only job is to call `POST /api/internal/sweep` on the Trading App
and to wait. The sweep code stays in `db-trading`; the route stays in `apps/web`, where the trading database URL
already lives (ADL: only `apps/web/app/lib/trading` reads `DATABASE_URL_TRADING`). The daemon reads no database URL and
imports nothing from `trading`. This keeps the ownership rules of ADR-0012 and ADR-0013 as they are.

- **Authentication.** The route accepts a bearer token and nothing else. The same value is configured under two names so
  that each secret is read in one place: `SWEEP_SECRET` for the route, `SWEEPER_TOKEN` for the daemon. Neither is set by
  this change.
- **Cadence.** The route's reply says how many orders are still open (not terminal, or terminal with an unreleased
  reservation). While any are, the daemon ticks every 5 seconds. When none are, it backs off, doubling, to **15
  minutes**; after failures it doubles to 5 minutes. The ceiling is not about the daemon's CPU. Every call reaches Postgres,
  and Neon suspends the compute only after 5 minutes without activity ([Scale to zero](https://neon.com/docs/introduction/scale-to-zero): fixed on Free; `cost/allowances.json` records 5
  minutes for this project's Launch plan, and the console shows the setting). A tick every 60 seconds would keep a 0.25 CU compute awake all month: 0.25 CU x 720 h = 180 CU-hours, about
  $19 at the $0.106 a CU-hour that `cost/allowances.json` records for the Launch plan (computed, not measured). At 15
  minutes the compute is awake about a third of the time. The sweep is not meant to be what moves a healthy order: the
  design is that the player's own requests do that (the order ticket's status poll runs the same tick for an open order), so the
  sweep finds what they did not finish, such as an order whose tab was closed.
- **Detection times (configured).** accepted with no hand-off: 30 s plus a tick; working with no fill: 15 min plus a
  tick; cancel unconfirmed: re-sent after 10 s, flagged after 5 min; a failed release: retried every tick, flagged
  after 3 failures. The wait between ticks is at most 15 min when idle and 5 s when active.
- **Idempotent jobs.** The sweep is written to be killed at any point and run again; two at once do no harm. The daemon
  handles `SIGTERM` by finishing or abandoning the request in flight and exiting; the next sweep completes the work.
- **Not switched on without the owner's yes.** This change does not add a `daemons` key to `vercel.json`, so no daemon
  reaches production when it merges. The configuration to add, and the two environment variables to set, are on the
  merge-day checklist. The daemon is run locally with Docker (previews do not run daemons).
- **Model.** When this ADR is Accepted, the ADL gains `Sweeper = apps/sweeper` with the dependency rules above and the
  two secret lines, and the Part 4 moment names the Sweeper as a node that calls the Trading App. The moment says
  whether it is running in production; it does not claim it is until the owner has switched it on.

The choice stands as the baseline only. The comparison with the other drivers is measured in
`architecture/reports/part-04/` and, if the measurements go against the daemon, a new ADR replaces this one.

## Consequences

- One more thing runs: a process that can be stopped at any time and that uses the team's 10 Active CPU-hours. When the
  quota is used up every daemon of the team stops until the first of the month; orders keep their state in Postgres and
  the first sweep after that finishes them, but until then nothing finds a stuck order. A cheaper backstop (the same
  route called on every order or status read, or the daily cron) is possible and is not built.
- Every tick is a function invocation of the Trading App and a trip to Postgres: 5 s is 17,280 a day (about 518,000 in 30
  days, half of Hobby's 1,000,000), which is why the cadence adapts; idle with a 15-minute ceiling is about 100 a day. The measured counts, Active
  CPU and bytes, and the cost model for the idle ceiling, are in the Decision 1 report.
- The daemon and the route have to agree on the reply's shape; a contract in `packages/contracts` carries it.
- Local testing is a Docker run and a test of the ticker with a fake clock and a stub server; a deployed daemon is not
  tested in previews, because there are none.

## Alternatives

- **A delayed Queues message per order, used as a timer.** Finds a stuck order when its message returns, with no process
  running. Every order costs at least four operations plus a function invocation per timer, and the order's life is
  spread over messages that Postgres does not know about. Measured in the Decision 1 report, not chosen here.
- **Workflows `sleep`.** The candidate of ADR-0017; it needs a handoff from Postgres that cannot commit with it (an
  outbox) and is judged after the baseline passes.
- **Schedules.** Rejected: 15 minutes of jitter on Hobby.
- **The daemon talks to Postgres itself.** Rejected for now: it would add a second reader of the trading database URL
  and a second writer of `trading.orders`, and change ADL rules that ADR-0012 and ADR-0013 set.
- **Cron.** Rejected: once a day, plus up to 59 minutes.

## Links

- ADR-0017 (the order lifecycle) — what the sweep does.
- ADR-0012 (schema and role per owner), ADR-0013 (one market-data owner) — why the daemon holds no database URL.
- ADR-0016 (only Accepted authorizes the model) — why the ADL and the moment wait for this ADR to be Accepted.
