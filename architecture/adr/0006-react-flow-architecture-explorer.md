# ADR-0006: React Flow for the architecture explorer

## Status

Accepted

## Date

2026-09-26

## Summary

React Flow explorer, backed by real CALM data

## Part

1

## Context

Part 1's landing page rendered the Part 1 architecture as a static SVG,
generated at build time by `@finos/calm-cli docify` from
`architecture/calm/moments/part-01.architecture.json`. The final design
(`Bullpen Architecture.dc.html` / `Architecture Page.dc.html`) instead
specifies an interactive explorer: a moment scrubber across all six parts,
selectable nodes with a detail side panel, toggleable views (grouping,
sync/async, data ownership), and a step-by-step "follow a request"
playback — none of which a static generated image can do. The landing
needs a real, interactive component; CALM/docify remains the source of
truth for the architecture's *structure*, but stops being what the
landing renders directly.

## Decision

Build the explorer in `packages/ui` with React Flow (`@xyflow/react`,
pinned at `12.12.0`), reading its content from
`content/architecture/part-0N.json` — one file per part, each holding
exactly the nodes, edges and relationships already declared in that
part's real or planned CALM moment (`architecture/calm/moments/` for
Part 1, `architecture/calm/planned/` for Parts 2–6), plus presentation-only
fields CALM doesn't carry (layout positions, a short display `meta`
label). A new `check:arch` rule cross-checks every explorer data file
against its CALM moment in both directions — every explorer node/edge id
must exist in CALM, and every CALM node must appear in the explorer — so
the picture and the model can't silently drift apart.

## Consequences

- The landing build no longer runs `calm docify`'s SVG export for its own
  rendering; CALM validation (`calm validate --strict`) and the new
  explorer-consistency check still run in CI and enforce the model
  independently of what's drawn.
- A real interactive component is more code than a generated image:
  React Flow gives node/edge primitives, viewport/pan/zoom and parent
  (group) nodes for free, but the custom node/edge visuals, the moment
  scrubber, toggles, side panel and playback are all bespoke, ported by
  hand from the design's exact animation and interaction spec (not
  approximated).
- Every part's explorer content must stay real: Parts 2–6 show exactly
  what their planned CALM moments already describe (including which
  external providers arrive in which part — e.g. Alpaca only appears in
  Part 6, per the real planned model), not invented or design-sample
  content.

## Alternatives

- **Keep the static CALM-generated SVG** — rejected. Can't support
  selection, scrubbing, toggles or playback; the design explicitly
  requires all of them.
- **Hand-drawn SVG (a bespoke diagram renderer, ported directly from
  `bullpen.js`'s `renderDiagram`)** — rejected for this codebase. It's
  the technique the design's own prototype uses, and works, but means
  hand-rolling hit-testing, pan/zoom, and layout/grouping primitives that
  React Flow already provides and maintains; not worth re-deriving here
  for a one-off explorer.

## Links

- `Bullpen Architecture.dc.html`, `Architecture Page.dc.html` — the
  design's interaction and animation spec this ADR implements.
- `architecture/calm/moments/part-01.architecture.json`,
  `architecture/calm/planned/part-0{2..6}.architecture.json` — the real
  structure `content/architecture/part-0N.json` must stay consistent with.
- ADR-0002 (why distribute at all) — this explorer is a *view* of that
  model, not a new architectural decision about Bullpen's own runtime
  shape.
