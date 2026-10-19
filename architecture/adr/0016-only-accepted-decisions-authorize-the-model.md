# ADR-0016: Only an Accepted decision authorizes the model

## Status

Accepted

## Date

2026-10-13

## Summary

A Proposed ADR or a "proposed" entry decides nothing

## Part

3

## Context

ADR-0009 made the CALM model answer to the decision records: an external
system in a moment must be decided in an ADR Decision, or listed as in use or
proposed in `docs/data-sources.md`. The check read every ADR's Decision as
decided, whatever its Status, and every docs entry headed "proposed" as
decided. A provider could therefore enter the model on the strength of a
decision I had not accepted. That is the drift the check exists to stop, left
open one level down.

## Decision

Only an Accepted ADR's Decision authorizes a node.

- A Proposed ADR's Decision counts as undecided. So does an ADR with any other
  status.
- A provider with no ADR is decided only by an entry in
  `docs/data-sources.md` that is in use. An entry headed "proposed" is
  undecided, like a Proposed ADR.
- A node whose provider is undecided fails `model currency`, naming the node
  and the ADR (or the docs entry), and the fix is to accept the decision or to
  rename the node.
- A quoted generic label that a decided entry defines is unchanged.

The rule's wording changes with it: "decided in an Accepted ADR's Decision or
listed as in use in docs/data-sources.md".

## Consequences

- An ADR that is still Proposed cannot be the reason a model names a provider.
  Accepting it is a step the owner takes, and the build shows when it has not
  been taken.
- ADR-0009, ADR-0010 and ADR-0011 were Proposed while the model already relied
  on them, so accepting them lands in the same change as the check.
- The status is read from the first line of the Status section, so a note
  under it does not change it.
- The carry-forward of built nodes (ADR-0011) is unchanged.

## Alternatives

- **Leave the check as it was** — rejected. A Proposed decision would keep
  authorizing the model.
- **Count a "proposed" docs entry as decided** — rejected. It leaves the same
  gap open through the docs file.
- **Require every provider to have an ADR** — rejected. A provider rejected or
  used once needs a record, but not necessarily a decision of its own.

## Links

- ADR-0009 (guardrails are enforced) — the check this makes status-aware.
- ADR-0011 (built nodes carry forward) — unchanged.
- `architecture/fitness/src/model-currency-check.ts` — the check.
