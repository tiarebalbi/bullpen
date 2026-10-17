# ADR-0011: Built nodes carry forward into the explorer's planned parts

## Status

Accepted

Clarified 2026-10-10: `builtIn` is where the item was first built, the check enforces both rules, and the week-one predictions live at the tag `predictions-week-1`.

## Date

2026-10-01

## Summary

Built nodes stay on the map in later planned parts

## Part

1

## Context

ADR-0006 says the explorer's Parts 2 to 6 show exactly what their planned CALM
moments describe. Those moments are the current plan for Parts 2 to 6, written before
ADR-0010 added Google Analytics 4 and Microsoft Clarity to the Part 1 moment.
So when a reader scrubs from Part 1 to Part 2, both cards and their four
edges vanish, and the explorer shows analytics removed after Part 1. That is
false: nothing in the plan removes them, the plans just never knew about
them.

I won't fix it by copying the nodes into the plan files. `planned/` is the
current plan, held to today's decisions by the model-currency check; the
week-one predictions as written are kept at the tag `predictions-week-1`, which
Part 6 compares with what shipped. Copying built nodes into five plan files
would put one fact in six places, and would treat a plan's silence about a
running system as a removal to correct.

## Decision

This amends ADR-0006: the explorer's planned parts show what their planned
moments describe, plus what is already built and still running. ADR-0006's own
text stays as written. The rule:

- A node or relationship of the latest built moment carries into every later
  planned part, marked `carried: true` with `builtIn` naming the earliest
  built moment that contains the item (`part-01`).
- The prediction wins: a planned part that already has a node with the same
  id keeps its own.
- The predictions own every id they name. An id that any planned moment names
  is never carried, so a predicted removal or replacement stays one. The Part 3
  split of the price snapshot service is the case this protects.
- A carried relationship also needs both of its ends present in that part.
- Once a later moment is built, the carry starts from that moment instead of
  Part 1. The rule is generic, with no list of nodes in it.
- Nothing is written into `architecture/calm/planned/`. Those files are never
  edited for this. The carry is computed when the landing loads the explorer
  parts, by one pure function in `packages/contracts` that the landing and the
  fitness check both use, so no derived data is committed and nothing needs
  regenerating when a part is built.
- The explorer consistency check, run by `check:arch`, enforces the rule. It
  accepts a carried item only if it is marked `carried`, exists in the latest
  built moment before that part, and its `builtIn` is the earliest built
  moment containing that id.
  Any other node missing from its own moment still fails. It reads each moment
  from the timeline rather than assuming which part is built.
- A carried card renders as it does in Part 1, with a "Built in Part 1" label,
  and does not appear under "What changed". It keeps its Part 1 position when
  that is free and otherwise moves to a lane to the right of the prediction's
  layout, because the predicted layouts were drawn without it.

## Consequences

- Scrubbing forward no longer shows built things removed. A reader can tell
  built from predicted by the label.
- The explorer's Parts 2 to 6 are no longer a pure picture of their planned
  moments, so ADR-0006's wording that they are "exactly" that no longer holds,
  and this record is where that is said.
- A prediction that omits a built node without naming it is read as silence,
  not as a removal. To predict a removal, a planned moment has to name the id.
- The carry is only as good as the built moment. If a built part drops a node,
  later parts drop it too.
- Carried cards sit in a lane when their Part 1 position is taken, which
  widens the Part 3 to 6 layouts a little and shrinks them on a phone.

## Alternatives

- **Write the analytics nodes into the planned CALM files** — rejected. It
  copies one built fact into five plan files that can each drift, and treats a
  plan's silence as a predicted removal.
- **Add the nodes to `content/architecture/part-0N.json` by hand** — rejected.
  It is derived data that goes stale the day a part is built, and it has to be
  remembered for every future built node.
- **Carry at render time inside the explorer** — rejected. The fitness check
  could then not see what the page shows, and the renderer would own a rule
  that is about the model.
- **Carry everything the built moment has, unconditionally** — rejected. It
  would draw the Part 1 price snapshot service next to the two services that
  replace it in Part 3.
- **Leave it** — rejected. The page would keep showing analytics removed.

## Links

- ADR-0006 (React Flow explorer) — amended by this decision.
- ADR-0010 (analytics behind consent) — the built nodes that prompted it.
- `architecture/calm/moments/part-01.architecture.json` — the built moment.
- `architecture/calm/planned/` — the current plan, never edited for this.
- tag `predictions-week-1` — the week-one predictions, as written.
- `packages/contracts/src/architecture/carry-forward.ts` — the rule.
- `architecture/fitness/src/explorer-consistency-check.ts` — the check that
  enforces it.
