# The trading app, built from the design

Date: 2026-10-16. Reference: the final design export in `design/export-2026-09-25-final/` (its files are byte-identical to the zip
`Design system scope form.zip`). The frames used are **Bullpen Terminal** (the desktop shell), **Bullpen Mobile Trading** (the phone
frames), **Bullpen Portfolio and Leaderboard** (the leaderboard row) and **Bullpen Design System** (tokens, `PriceCell`,
`ConnectionIndicator`, the empty, error and loading cards). There is no `design/brief.md` in the repo. The `.dc.html` frames need the
design tool's own runtime to draw their data (opened in a plain browser they show their template placeholders), so the pictures
beside mine are the screenshots the export ships in `design/export-2026-09-25-final/screenshots/`.

## What I built

A terminal from the design, not a layout of my own: tokens from `colors_and_type.css` through `packages/ui`, dark first, shared with
the landing.

| Piece | From the design | Built as |
|---|---|---|
| The shell: header, watchlist left, main panel, right rail | Terminal | `TerminalShell`, `TerminalHeader` (`packages/ui`); stacks under 64 rem |
| Watchlist sections and rows with symbol chips | Terminal, Mobile | `WatchlistSection`, `WatchlistRow` over `TickerBadge`; `Stocks` and `Crypto` sections in `apps/web` |
| Price in the state it is in | Design System: `PriceCell`, "Close · 16:00 ET", "Stale, always labeled" | `PriceCell` (new `stale`, `asOfLabel`), `isUsMarketClosed` |
| Leaderboard rows, ties sharing a rank | `LeaderboardRow` 1d | `LeaderboardRow`, `LeaderboardList`; ranks computed in the read, ties share one |
| The order ticket, off | Terminal rail | `OrderTicketLocked` (rail), `TradeBarLocked` (pinned to the bottom of a phone): "Trading opens with sign-in in Part 4" |
| Empty, stale, market closed, loading, error, database unavailable | Design System cards | `EmptyState`, `ErrorState`, `Skeleton`, `ConnectionIndicator`, the `Unavailable` state |
| Dark first, with a toggle | the design's own default | `useTheme`, `THEME_INIT_SCRIPT` (a subpath so a Server Component can import it) |

Not built, because Part 3 has no sign-in: the account and portfolio screens and a working buy ticket. They are listed in the PR
description and wait for Part 4.

## Every deliberate difference from the frames

1. **No league name or EQUITY / TODAY / RANK in the header.** They come from an account in a league, and there are neither.
2. **No sparklines and no chart.** They need a history of prices, and the database holds one close a day for stocks and none for
   crypto. The main panel says "No price history yet" instead of drawing a line through one point.
3. **No company names ("Apple") and no "30 held".** The price data carries symbols only, and nobody holds anything.
4. **No gain or loss on a stock.** There is no previous close to compare with. The crypto row has the route's change, with ▲/▼ and a
   signed value, never colour alone.
5. **The leaderboard sits where the design has Positions.** Positions need an account; the ranking does not. Its rows carry no gain
   percentage or sparkline (no opening balance, no history).
6. **The ticket is disabled, not hidden.** Buy, Sell, Market, Limit, Quantity and the one button are all there and all off; Estimated
   cost and Buying power show a dash, because there is no account to take a number from.
7. **No Active order or Recent fills.** There are no orders.
8. **No "Under the hood · Part 4 architecture" panel and no Replay.** The architecture explorer lives on the landing page.
9. **A phone has a pinned Sell / Buy bar (both off) instead of a bottom sheet.** The sheet is what Buy opens, and Buy is off.
10. **Added, not in the design:** "Database unavailable" (the stocks and the leaderboard read the database; the live price does not); a
    "Showing the top 50 of N players" line, because the read is capped at 50 plus the caller's own row; a data-source credit in the
    watchlist next to every price, because the providers' terms ask for one beside the price they supply.
11. **The market-closed label is only ever "closed".** `isUsMarketClosed` knows weekends and 09:30-16:00 in New York but no exchange
    holidays, so it says "Market closed" when the clock makes that certain and says nothing otherwise, never "open".
12. **A theme toggle in the header.** The design switches theme in its own presentation bar, not in the app.

## Rules from the brief, and where each is held

| Rule | Where |
|---|---|
| Gain and loss never carried by colour alone | `PriceCell` and the crypto row print ▲/▼ and a signed value with a true minus; staleness is a word ("Stale · Oct 8", "stale · as of Oct 8"); `trading-screens.spec.ts` asserts the glyph and words |
| Tabular numerals for prices | `font-variant-numeric: tabular-nums` on every price, equity and cash; asserted in the e2e |
| Works at 390 px | every state is run at 1440 and 390 px, each with a no-horizontal-scroll check; the shell stacks and the trade bar is pinned |
| Ties share a rank | computed in the read (`RANK()`), tested in the database suite and in the page |
| Tokens and components shared with the landing | all in `packages/ui`; `apps/web/app/web.css` holds only what is particular to the page |
| No design sample data in the HTML | components take every value as a prop; tests use throwaway handles and prices that exist only in the test |

## Side by side

Left: the design export's own screenshot. Right: the built page, from `SCREENSHOT_DIR=<dir> pnpm --filter @bullpen/web exec playwright
test e2e/trading-screens.spec.ts` (one picture per state and width, in `design/built/`).

| What | Design | Built, 1440 px | Built, 390 px |
|---|---|---|---|
| The terminal | ![](design/frames/term-live.jpg) | ![](design/built/terminal-default-1440.png) | ![](design/built/terminal-default-390.png) |
| Watchlist, mobile frames | ![](design/frames/01-mob1.jpg) | ![](design/built/watchlist-stocks-1440.png) | ![](design/built/watchlist-stocks-390.png) |
| Leaderboard row | ![](design/frames/lb-fix.jpg) | ![](design/built/leaderboard-ranked-1440.png) | ![](design/built/leaderboard-ranked-390.png) |
| Empty, error, loading cards | ![](design/frames/ds-v03.jpg) | ![](design/built/leaderboard-empty-1440.png) | ![](design/built/leaderboard-empty-390.png) |

Every other state, built:

| State | 1440 px | 390 px |
|---|---|---|
| Stock close, selected | ![](design/built/detail-stock-close-1440.png) | ![](design/built/detail-stock-close-390.png) |
| Stock stale, selected | ![](design/built/detail-stock-stale-1440.png) | ![](design/built/detail-stock-stale-390.png) |
| Market closed | ![](design/built/watchlist-market-closed-1440.png) | ![](design/built/watchlist-market-closed-390.png) |
| Crypto falling | ![](design/built/watchlist-crypto-down-1440.png) | ![](design/built/watchlist-crypto-down-390.png) |
| Crypto stale | ![](design/built/watchlist-crypto-stale-1440.png) | ![](design/built/watchlist-crypto-stale-390.png) |
| Watchlist empty | ![](design/built/watchlist-empty-1440.png) | ![](design/built/watchlist-empty-390.png) |
| Watchlist loading | ![](design/built/watchlist-loading-1440.png) | ![](design/built/watchlist-loading-390.png) |
| Watchlist failed | ![](design/built/watchlist-failed-1440.png) | ![](design/built/watchlist-failed-390.png) |
| Leaderboard tie | ![](design/built/leaderboard-tie-1440.png) | ![](design/built/leaderboard-tie-390.png) |
| Leaderboard stale, refresh failed | ![](design/built/leaderboard-stale-1440.png) | ![](design/built/leaderboard-stale-390.png) |
| Leaderboard loading | ![](design/built/leaderboard-loading-1440.png) | ![](design/built/leaderboard-loading-390.png) |
| Leaderboard failed | ![](design/built/leaderboard-error-1440.png) | ![](design/built/leaderboard-error-390.png) |
| Database unavailable | ![](design/built/database-unavailable-1440.png) | ![](design/built/database-unavailable-390.png) |
| Order ticket off | ![](design/built/order-ticket-off-1440.png) | ![](design/built/order-ticket-off-390.png) |
| Light theme | ![](design/built/terminal-light-1440.png) | ![](design/built/terminal-light-390.png) |
