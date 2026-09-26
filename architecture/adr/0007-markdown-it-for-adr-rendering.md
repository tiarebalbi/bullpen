# ADR-0007: markdown-it for rendering ADRs in the Decisions modal

## Status

Accepted

## Date

2026-09-26

## Summary

markdown-it renders ADR bodies, raw HTML off

## Part

1

## Context

The Decisions section's modal shows an ADR's full body (Context, Decision,
Consequences, Alternatives, Links) when a reader clicks its row, rendered
from the same `architecture/adr/*.md` files `adr.ts` already parses for the
row list. Those bodies are plain but not trivial: numbered and bulleted
lists, bold text, inline code, and links. Rendering them as literal
`<pre>` text (as the old ADR cards did with excerpt strings) would lose
that structure inside the modal, and hand-rolling a parser for even this
constrained a subset of Markdown risks getting list/emphasis edge cases
wrong.

## Decision

Render each ADR's Context/Decision/Consequences/Alternatives/Links
sections to HTML at build time with `markdown-it` (pinned at `15.0.2`,
`apps/landing`'s own dependency, not `packages/ui`'s, since only the
landing's server-side loader ever parses Markdown), with its default
`html: false` option left untouched so raw HTML embedded in an ADR file
is escaped, not passed through. The resulting HTML strings are computed
in `lib/adr.ts` (a Server Component boundary) and passed to the modal as
plain data, never as a function — the same RSC serialization constraint
the Architecture Explorer's `adrHrefs` fix already established.

## Consequences

- Every ADR must keep rendering cleanly through `markdown-it`'s default
  (CommonMark-ish) rule set; nothing in this repo's ADRs needs its plugin
  system, so no plugins are added.
- If an ADR ever needs raw HTML (an embedded diagram, say), that's a
  deliberate follow-up decision, not something that silently starts
  working because a flag got flipped.
- The Decisions section gains a second real dependency (`packages/ui`'s
  `@xyflow/react` was the first, ADR-0006) that only exists because a
  design element needs a library, not because a feature invented its own
  requirement for one.

## Alternatives

- **`marked`** — rejected. Simpler API, but its HTML-escaping behavior
  changed across major versions and current guidance points at a
  separate sanitizer (e.g. DOMPurify) rather than a built-in "never emit
  raw HTML" flag; `markdown-it`'s `html: false` default does that
  directly, with no second dependency.
- **Hand-rolled section renderer** (regex/line-based, matching this
  repo's own constrained ADR shape) — rejected. Every ADR body already
  fits Markdown's list/bold/link/code constructs; a bespoke renderer
  would just be a worse, unaudited reimplementation of what
  `markdown-it` already does correctly.
- **`react-markdown`** — rejected. Renders Markdown to React elements at
  request time in a Client Component; this repo's ADR content is static
  at build time, so paying a client-side Markdown parser (and its AST
  dependencies) for output that never changes at runtime isn't
  justified.

## Links

- ADR-0006 (React Flow for the architecture explorer) — the prior
  "pin the exact version, record the decision" precedent this ADR
  follows for a second UI-facing dependency.
- `apps/landing/lib/adr.ts` — where `markdown-it` is used, and where the
  rendered HTML strings are computed before being passed to the client
  modal component.
