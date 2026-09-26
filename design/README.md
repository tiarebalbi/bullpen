# Design export

Source: `~/Downloads/bullpen-final.zip`, the final, approved export covering
all five design prompts. Unzipped unchanged into `export-2026-09-25-final/`
on 2026-09-26. Original zip left in place at `~/Downloads/bullpen-final.zip`.

This replaces the earlier `export-2026-09-25/` export (from an early,
partial Claude Design file limited to the design system and landing page),
which has been removed from the repo. Verified by checksum before removing
it: `colors_and_type.css` and `Bullpen Landing.dc.html` are byte-identical
between the two exports — nothing Part 1 already built changed. The design
system file did change, but only additively (a new "v0.3 — trading app"
section appended after the existing content; the sections that actually
define `TickerBadge`, `PriceCell`, `ConnectionIndicator`, `Button` and `Chip`
are untouched).

## File list, grouped by where it is used

**Part 1 (design system, landing):**
- `Bullpen Design System.dc.html`
- `Bullpen Landing.dc.html`
- `colors_and_type.css`
- `bullpen.js` — shared sample data, simulations, and the architecture
  diagram renderer; later parts' scripts build on this one.
- `fonts/NunitoSans-VariableFont_YTLC_opsz_wdth_wght.ttf`

**Part 2 (architecture page):**
- `Architecture Page.dc.html`
- `Bullpen Architecture.dc.html`
- `architecture.js`

**Parts 3–5 (trading app, portfolio / leaderboard / admin / system, status):**
- `Bullpen Terminal.dc.html` — the trading terminal
- `Bullpen Mobile Trading.dc.html`
- `Bullpen Join and Lobby.dc.html`
- `Bullpen Portfolio and Leaderboard.dc.html`
- `Bullpen League Admin and System.dc.html`
- `Bullpen Status.dc.html` — the status page
- `trading.js` — scenarios, order engine, views

**Blog, not deployed (embeds, post heroes, share cards):**
- `Blog Embed.dc.html`
- `Bullpen Blog Assets.dc.html`
- `Post Hero.dc.html`
- `Share Card.dc.html`
- `blog.js`

**Not tied to one part:**
- `Bullpen Prototype.dc.html` — a linked, clickable prototype flow across
  several screens (join/lobby-first); reference for flow/sequencing, not a
  single part's spec.
- `support.js` — the design tool's own generated rendering runtime
  (`dc-runtime`), not application code to port.
- `.thumbnail`, `screenshots/`, `uploads/` — export artifacts, not sources.

## Chosen variants (do not re-pick)

- Hero: **1j**
- Blueprint diagrams: **1g**
- Leaderboard: **1d** (spring + delta chip)
- PriceCell: the tick treatment used on the landing page

Confirmed unchanged in the final export (`Bullpen Landing.dc.html` is
byte-identical to the file these were originally chosen from). These are the
variants ported into `packages/ui` and used on the landing page. Later work
should reuse them rather than choosing a different variant from the export.
