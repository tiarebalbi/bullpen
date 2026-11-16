# ADR-0032: The Hobby daemon quota is 5 Active CPU-hours

## Status

Accepted
Incomplete: see ADR-0033 for the memory quota.

## Date

2026-11-16

## Summary

Hobby daemons get 5 Active CPU-hours a month, not 10

## Part

5

## Context

ADR-0018 (2026-10-20) says a Hobby team has a quota of 10 Active CPU-hours a month for daemons, and the Part 4 report repeats it. Part 5's report found that Bullpen's own records disagreed: the sweeper's cost note in
`content/architecture/` said 10 and `cost/allowances.json` had no daemon entry at all.

Vercel's page on daemon limits ([Daemons limits](https://vercel.com/docs/daemons/limits), read 2026-11-15) says, for Hobby: 5 Active CPU-hours and 420 GB-hours of Provisioned Memory per month; the quotas apply to the team, across all of
its projects; when a Hobby team reaches either one, Vercel stops the team's daemons until the first of the next month (UTC). The same page says daemons run only in the production environment, and that the limits apply during the beta
and may change. I cannot tell from here whether the quota was 10 when ADR-0018 was written and has since changed, or whether the figure was wrong from the start.

## Decision

Bullpen plans against **5 Active CPU-hours a month, per team, for daemons, in production**. This ADR corrects the figure in ADR-0018, which keeps its decision (a daemon that calls a sweep route) and its text; ADR-0018 carries one extra
status line, "Amended by ADR-0032", and nothing else of it changes. The Part 4 report is a dated record and is not edited.

Three places now say 5, and a test holds them equal: the sweeper's `costNote` in every `content/architecture/*.json` that has one, the daemon entry in `cost/allowances.json` (service `vercel-daemons`, source and date as above), and this
ADR.

## Consequences

- The sweeper's quota is half of what ADR-0018 gave, so there is half the room before Vercel stops the team's daemons for the rest of a month. The sweeper's Active CPU has not been measured; the dashboard reading goes into `cost/usage` when the owner supplies it.
- If the quota runs out, ADR-0018's fallback is unchanged: orders keep their state in Postgres, and a player's own poll still moves their orders along.
- The architecture page shows 5 on the sweeper node and still shows 10 in ADR-0018's text. ADR-0018's "Amended by ADR-0032" status line is the pointer between them.
- A published post that states 10 stays as it was until its author decides whether to add a dated correction.
- `fitness` has a test that fails if an ADR says it is amended by an ADR that does not exist, is not Accepted, or does not name the ADR it amends.

## Alternatives

- **Edit ADR-0018 in place.** Rejected: an accepted ADR is not edited, and the figure is context for a decision that still stands.
- **A dated correction section at the end of ADR-0018, as ADR-0020 had.** Rejected here: the correction also changes the cost ledger and the explorer, and it needs its own source and date, so it gets its own record.
- **Leave 10 and note the doubt.** Rejected: the vendor's page says 5, and a planning figure that is twice the real one hides the risk it exists to show.

## What would flip it

- Vercel changes the Hobby daemon quota (it says it may, during the beta): a new ADR then amends this one, and the ledger entry and notes follow.

## Links

- ADR-0018 (the sweeper is a daemon that calls a route; this ADR amends the quota figure in its context and consequences), ADR-0021 (the sweeper's idle wait is sixty minutes).
- Vercel, [Daemons limits](https://vercel.com/docs/daemons/limits), read 2026-11-15.
- `cost/allowances.json` (the `vercel-daemons` entry); `post-facts/part-05.md` (item 10, where the mismatch was found).
