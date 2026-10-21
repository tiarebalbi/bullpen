# Landing cards: design review (Track A)

Branch `landing-cards`, from `main` at `e34efd3`. Reviewed 2026-10-20 (screenshots and Lighthouse run at about 2026-10-21T03:50Z).

What changed on the landing: the section from `#decisions` through `#cost`. Decisions gets filter tabs, compact rows and "View all"; Rules becomes a ratio card
with a "What's defined" card beside it and eight rule tiles that open one shared panel; Cost becomes a 5/7 pair. Everything else on the page is untouched.

## How the frames were made

- **The design**: `Bullpen Landing.dc.html` from the Claude Design export, unzipped outside the repo and served from a local static server (the file does not run from `file://`).
  Dark is the design's default; "Light" is its own toggle. Frames are the desktop grid, the grid with the first tile open, the Cost pair, and the mobile frame.
- **The app**: the production build of this branch (`next build`, `next start`), with the consent cookie set to "rejected", the price route mocked, and the theme set through the
  `bp-theme` key the app itself reads. Frames: `.bp-status-grid` (with and without a tile open) and `.bp-cost-grid`, at 1440 and 390 px, in both themes.
- Files here are named `design-<size>-<theme>-<frame>.png` and `app-<size>-<theme>-<frame>.png`. The design's mobile frame is one tall image (`decisions-to-cost`); the app's mobile grid and cost
  frames are the same sections.

## Section by section

| Section | Matches / differs | Why |
|---|---|---|
| Decisions card: seven of twelve columns, two rows, heading, note | matches | `design-desktop-*-grid` against `app-desktop-*-grid` |
| Filter tabs (All, Part 1, Part 2, Part 3, each with a count) | matches | built from the ADR files; a new ADR in a new part adds a tab with no copy edit |
| Compact rows: id in mono, summary, part | matches, one addition | an ADR that is not Accepted shows its status as a chip (the design has no status) |
| Footer: "6 of 16 decisions" and "View all 16 →" (`aria-expanded`), "Show fewer" | matches | expands in place; collapses when the tab changes |
| Rules card: ratio in `--bp-gain`, "RULES PASSING", last snapshot date and commit | matches, one addition | all three come from the committed snapshot. A "View structure.adl" link sits under the note, so the whole-file dialog stays reachable without opening a tile |
| What's defined: SYSTEM / COMPONENT / LIBRARY and the total | matches | read from `structure.adl`; the design's mobile frame omits this card and the app keeps it |
| Eight rule tiles, three columns each, four to a row | differs in the numbers | the label says "N rules", not "N assertions", and the counts include the 7 rules the checks enforce that `structure.adl` has no line for (see below). "Disallowed dependencies" keeps its "(direct and transitive)" sub-title; a tile names every check that enforces its rules, where the design names one |
| Tile detail panel: file name, "Close", ASSERT lines syntax-coloured, check name, result | matches, one addition | a second list, "Also enforced here, with no line in structure.adl", under the ASSERT lines of the four families that have such rules. Opening a tile moves focus into the panel; Close and Escape return it to the tile |
| Cost card: spend and per-player estimate | differs (data honesty) | the design's "$0.00 spent in September" and "$1.84 per 1,000 players" are sample numbers. The app says "pending" for spend (the ledger holds no dollar amount; Neon has been on Launch since 2026-10-16 and its usage for the latest week has not been read) and "Arrives in Part 5" for the estimate |
| Cost card: allowance count and list | differs (data honesty) | "24 free-tier allowances tracked" and a drawer that lists exactly 24 rows, each with its source and the date it was checked. Redis and Lambda stay in the ledger and off the page; Grafana is a Part 5 entry |
| Free-tier usage: rows, bars, "as of" time | differs (data honesty) | the design's rows (Market data, Postgres, Message queue, Redis, Apps hosting) are not Bullpen's. The app lists the services that run today, from the ledger, each "usage pending" with an empty track (no bar, no number) and the date its allowance was checked; the header names the snapshot week and period instead of a time |
| Footer | not touched | the design says "Market data: IEX via Alpaca · Coinbase"; the page keeps its own wording (CoinGecko, end-of-day stocks) |
| Mobile (390): tabs | matches | one scrolling row, every target 44 px or taller |
| Mobile: decisions rows | matches | the id and the part on one muted line, the summary under it |
| Mobile: tiles | matches | one per row, a title and a pass chip with the count and "View" under them; a tile opens its panel directly under it |
| Mobile: cost | matches in structure | the two figures sit side by side and the usage rows stack under them; the app keeps the cards' frames, which the design's mobile frame drops |
| Mobile: Rules note | differs | the design drops the paragraph under "Checked, not hoped for" on mobile; the app keeps it |

Light and dark: both themes use the design's tokens. The only colour set locally is the pill behind a status chip (see Accessibility).

## The count: 38 against 32

Production said "38 of 38 rules passing" while its cards listed 32 things. The 38 is the snapshot's own count: the 30 ASSERT lines of `structure.adl` plus 8 rules that `check:arch` enforces and the ADL has no line for.
The tiles showed the 30, the CALM command and the budget rule: 31 of the 38 rules and one command. Seven rules were enforced and shown nowhere.

They are now listed inside the tile of their family, under their own heading, and counted there:

| Rule (check) | Tile |
|---|---|
| every external system is decided; every ADR is linked; every CALM control names a file that exists (model currency) | Model currency |
| every explorer node and edge exists in its CALM document (explorer consistency) | Model currency |
| a migration touches only its owner's schema (data ownership) | Data ownership |
| every ADL ASSERT is enforced by a check (rule coverage) | Structural assertions |
| no file contains the repo author's email address (email in files) | Entry points and secrets |
| modeled CoinGecko calls stay within 90% of the allowance (budget) | its own tile, as before |

The tile counts are 3, 3, 14, 7, 4, 6 and 1 (the CALM tile is a command, not a snapshot rule), which add up to 38. The build computes the sum and fails if a snapshot rule is in no tile or in two; a rule from a
check that has no tile makes the build fail with the check's name. Tests: `lib/ruleTiles.test.ts` (including the real committed snapshot) and `e2e/rule-tiles.spec.ts`.

## Accessibility

- **Keyboard**: the tabs are a roving tablist (arrow keys, Home and End select and move focus; only the selected tab is in the tab order); each decision row is a link that opens the ADR dialog and Escape returns focus to the row;
  "View all" is a button with `aria-expanded`; a tile is a button with `aria-expanded` and `aria-controls`; Enter opens the panel and moves focus into it, Tab reaches "View structure.adl" and "Close", Escape or Close closes the panel and
  returns focus to the tile; the cost drawer is a `<details>`. All of this is in `e2e/decisions-filter.spec.ts`, `e2e/rule-tiles.spec.ts` and `e2e/status-grid.spec.ts`.
- **Focus ring**: ember (`--ember`), 2 px, on the tabs, "View all", tiles, "Close", the panel and the structure.adl link; the tests read the computed outline.
- **Targets**: every tab, button and tile is at least 44 px tall at 390 px; tested.
- **Contrast and axe** (`@axe-core/playwright` 4.14.0, a dev dependency; WCAG 2 A and AA, 2.1 A and AA, best practice): no violations on the status grid and the cost cards in light and dark at 1440 and 390 px, with a tile open and the cost drawer open.
  axe found two real problems the first time: the pass chip on the open tile and on the panel's footer measured 4.2:1 and 3.83:1 in the light theme. The chip's tint is see-through and those two surfaces are darker than a card.
  It now sits on a pill of the card's own colour, where it measures above 4.5:1.
- Reduced motion: the only motion added is a 2 px lift on hover for tiles and "View all"; the page's existing `prefers-reduced-motion` rules are unchanged.

## Lighthouse

Median of three runs, Lighthouse 12.8.2, against a local production build of `main` and of this branch (same machine, same Node server, so the comparison is like for like; production on the CDN was not measured).
Command: `npx lighthouse@12.8.2 http://localhost:<port>/ --only-categories=performance,accessibility` (add `--preset=desktop` for desktop). Raw scores of the first run of each are in `raw/`.

| | Performance, main | Performance, branch | Accessibility, main | Accessibility, branch |
|---|---|---|---|---|
| Mobile | 94 | 94 | 96 | 97 |
| Desktop | 96 | 96 | 100 | 100 |

No regression. The accessibility items still failing on mobile (target size and label-content-name on the architecture explorer's React Flow nodes) are the same on `main` and are not in the sections changed here.

## Tests

Unit: `decisionsView`, `ruleTiles`, `definedView`, `costView`, `loadLatestUsage`. End to end: `decisions-filter`, `rule-tiles`, `status-grid`, `a11y`, and the existing `decisions`, `rules-adl`, `fidelity` and `smoke` specs updated to the new layout.
The full landing suite passes.

## Not done, and why

- The design frames are screenshots of the design's own sample content, served locally. They sit beside the app's as reference and are not used by the site.
- The architecture explorer's own accessibility findings are not part of this change.
