# ADR-0015: The ADL maps to the latest built moment

## Status

Accepted

## Date

2026-10-13

## Summary

ADL maps to the latest built moment

## Part

3

## Context

The model-currency check held the ADL to the timeline's `current-moment`. That
pointer says which part is published, and it moves on publish day. A branch
that builds Part 3 adds directories (`packages/db`, a `market-data` service)
that the ADL must DEFINE, and the structure rule requires every directory to
be DEFINEd. The check then asked for a node for each of them in the Part 2
moment, which describes a system that does not have them. The only ways to
pass were to edit the Part 2 moment (falsifying what was published) or to
move `current-moment` early (publishing before the post).

## Decision

The ADL describes the code on the branch, so the model-currency mapping
compares it with exactly the latest built moment: the highest-numbered
`architecture/calm/moments/part-0N.architecture.json`. `current-moment` stays
the pointer to what is published and is not consulted for the mapping.

- An ADL component or library with no node in the latest built moment fails,
  naming that moment's file.
- An entry that the latest built moment has and `current-moment`'s moment
  lacks passes.
- The moment file for the part under construction is created at the start of
  that part's data work with the previous part's nodes. Every commit that adds
  a DEFINE adds its node in the same commit, so `check:arch` is green on every
  commit.
- The explorer's carry rule (ADR-0011) is unchanged: built means up to
  `current-moment`.

## Consequences

- The check, the ADL and the moments are untouched in what they say; only the
  moment the mapping reads changes.
- Two meanings of "built" now exist: published (`current-moment`, used by the
  explorer) and latest built (used by the mapping). The post and the timeline
  keep them apart.
- On publish day the one-line change is still `current-moment`.

## Alternatives

- **Edit the published moment** — rejected. It rewrites what was published.
- **Move `current-moment` forward during the build** — rejected. It publishes
  before the post and changes what the explorer shows as built.
- **Accept either the current or the latest moment** — rejected. A rule that
  accepts two answers cannot say which one the ADL describes.

## Links

- ADR-0009 (guardrails are enforced) — the drift check this changes.
- ADR-0011 (built nodes carry forward) — unchanged.
- `architecture/fitness/src/model-currency-check.ts` — the check.
