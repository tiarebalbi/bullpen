# ADR-0033: Until December 1, the sweep runs from GitHub Actions

## Status

Accepted

## Date

2026-11-16

## Summary

Until Dec 1 a scheduled workflow runs the sweep

## Part

5

## Context

The production sweeper daemon stopped on 2026-11-15 with "Daemon stopped: this team used its Hobby Daemons quota of 420 GB-hours of provisioned memory for this month." ADR-0032 recorded the Hobby daemon quota as 5 Active CPU-hours and noted
the second limit on the same page, 420 GB-hours of provisioned memory a month, per team, without checking it against `vercel.json`. The sweeper is given 2 GiB per instance and provisioned around the clock: 2 GiB × 720 h is 1,440 GB-hours
a month, more than three times the 420. ADR-0018 and ADR-0032 tracked Active CPU only, and that was the gap.

At the quota Vercel stops every daemon on the team until the first of the next month (UTC). Until 2026-12-01 nothing admits queued orders at the open (ADR-0028), nothing advances open orders, and nothing releases reservations. Nothing is
lost: orders keep their state in Postgres, and the sweep route is idempotent, so a sweep that runs late does everything it would have done on time.

## Decision

Until 2026-12-01 a GitHub Actions workflow (`.github/workflows/sweep.yml`) runs the same sweeper code (`apps/sweeper/src/main.ts`) against the same production route, on a five-minute schedule. Nothing in the sweeper, the route or `vercel.json` changes.

- It runs `main` only, so a branch can never run against production, and it has no repository permissions beyond the checkout.
- Each run is `timeout --signal=TERM 280 node apps/sweeper/src/main.ts`. The sweeper loops every five seconds while orders are open, waits for the open when it is near, and leaves cleanly on SIGTERM; `timeout` ends it before the next run starts, and exit code 124 is that ending. Runs do not overlap (`concurrency`, no cancelling).
- The address is the repository variable `SWEEPER_TARGET_URL` and the token the repository secret `SWEEPER_TOKEN`. Neither is written in the file, and a fitness test fails if either is. The sweeper logs only the address's origin, never the token.
- The owner switches it on and off with the repository variable `SWEEP_FROM_ACTIONS`: only the value `on` runs it, and deleting the variable stops it with no commit. A guard step skips every run on or after 2026-12-01 UTC, so it cannot outlive the quota reset by accident.

A fitness test (`architecture/fitness/src/sweep-workflow-check.test.ts`) holds these rules against the file.

## Consequences

- **GitHub may start a scheduled run late or skip one under load.** Scheduled workflows are not a clock: a run can start several minutes after its time, and a busy period can drop runs. A queued order can therefore be admitted several minutes after 9:30 ET, and open orders advance in bursts, not every five seconds, with gaps between runs. This is worse than the daemon at its best, and it is the reason this is a stopgap.
- The stopgap spends GitHub Actions minutes: a run lasts up to 280 s every five minutes, around the clock, about 80 hours a day of runner time at the worst. On a public repository these are free; on a private one they count against the plan. The owner checks which applies before turning it on.
- It runs only after this ADR's workflow is on `main`, because it checks out `main`.
- The sweeper's `costNote` now states both Hobby daemon limits, 5 Active CPU-hours and 420 GB-hours of memory, and a test holds the note to the ledger for both.
- The lasting fix is a memory size that fits the quota, which is the owner's decision and is not made here. The sweeper's measured resident memory is reported separately.

## Alternatives

- **Vercel Pro.** Rejected for now: it spends money to cover a few weeks, and the project's rule is that cost is a check on the design and not a bill it grows into.
- **Leave it off until December.** Rejected: a queued order would not be admitted at the open for two weeks, which is what Part 5 is about.
- **Resize the daemon now.** Not done in this change: the size is the owner's decision, and a redeploy is the owner's to make.

## What would flip it

- 2026-12-01 (UTC), when the quota resets: the workflow's guard ends it and the variable is deleted.
- A sweeper sized to fit the memory quota is deployed and running: the workflow is then switched off and removed.

## Links

- ADR-0018 (the sweeper is a daemon that calls a route), ADR-0032 (the Hobby daemon quota; it recorded the memory limit but tracked only Active CPU), ADR-0028 (queued orders are admitted at the open).
- Vercel, [Daemons limits](https://vercel.com/docs/daemons/limits), read 2026-11-15.
- `.github/workflows/sweep.yml`, `cost/allowances.json` (the `vercel-daemons` entries).
