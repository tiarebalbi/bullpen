# Design export

Source: `~/Downloads/bullpen.zip`, unzipped unchanged into
`export-2026-09-25/` on 2026-09-25. Original zip left in place.

## File list (as found — differs from what was expected)

Expected and present: `Bullpen Design System.dc.html`, `Bullpen Landing.dc.html`,
`colors_and_type.css`, the Nunito Sans variable font.

Also present, not called for in Part 1:

- `Architecture Page.dc.html`, `Bullpen Architecture.dc.html`, `architecture.js`
  — for the Part 2 architecture page. Not used yet.
- `bullpen.js`, `support.js`, `trading.js` — helper scripts for later parts
  (trading UI, support/empty states). Referenced only where a Part 1
  component genuinely needs them.
- `screenshots/`, `uploads/`, `.thumbnail` — export artifacts, not sources.

## Chosen variants (do not re-pick)

- Hero: **1j**
- Blueprint diagrams: **1g**
- Leaderboard: **1d** (spring + delta chip)
- PriceCell: the tick treatment used on the landing page

These are the variants ported into `packages/ui` and used on the landing
page. Later work should reuse them rather than choosing a different variant
from the export.
