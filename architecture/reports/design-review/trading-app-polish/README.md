# Trading app polish: design review

Ours is `app/terminal-{dark,light}-{1440,390}.png` (a signed-in player with one filled order, from the fixtures in `apps/web/e2e/trading-terminal.spec.ts`; produced with
`SCREENSHOT_DIR=<dir> pnpm exec playwright test e2e/trading-terminal.spec.ts -g accessibility` in `apps/web`). The design is `design-term-live.jpg` and
`design-mobile-01.jpg` (the committed screenshots in `design/export-2026-09-25-final/screenshots/`), and `design-terminal-1440.png` / `design-mobile-390.png`, which are
`Bullpen Terminal.dc.html` and `Bullpen Mobile Trading.dc.html` opened headless: those files are templates filled by a script, and the headless render shows the frame without its
data, so the committed screenshots are the reference for content. Not checked against the live frames: pixel measurements of spacing, which were matched through the shared tokens (`@bullpen/ui`), not measured.

| Area | Design | Ours | Verdict | Reason |
|---|---|---|---|---|
| Frame | three columns: watchlist, main, ticket and order rail; stacked with a pinned bar on a phone | the same, from `TerminalShell`; the main column now sizes to the screen (a grid column was taking the width of its widest table) | matches | |
| Header: wordmark, equity, rank | equity, "Today", rank | equity from the account view, rank "#n of N" from the leaderboard, hidden until ranked | matches | "Today" differs: **data honesty** (there is no intraday equity history) |
| Header: season "Fall Open · ends Oct 31" | shown | not shown | differs | **needs Part 5 data** (no season name or end date exists) |
| Header: feed chips | live | "Stocks · end of day", and the crypto state in words and glyph (live, stale, offline) | matches | the stock chip no longer says "market closed": the feed is end of day always |
| Header: avatar | initials tile | a neutral tile and "Player ####" | matches | never a GitHub name or picture (the privacy test stays) |
| Header: "Under the hood", "?" button | shown | "?" is the keyboard `?`; no drawer | differs | **out of scope** (Under the hood) |
| Watchlist rows | tile, name, price, sparkline, change | tile, symbol, "Close · date", price, change vs previous close | differs | no company names and no sparklines: **needs Part 5 data**. The change shows only when both closes are stored (ADR-0025) |
| Watchlist: "N held" | shown | "30 held" from positions, only when held | matches | |
| Watchlist: ETH, SOL, indices | shown | BTC and the stocks the ingest stores | differs | **out of scope** (ETH/SOL) |
| Selected symbol | name, price, change today, freshness, chart | name, price, "Close · date" or "Live", and an empty chart frame saying a chart arrives in Part 5 | differs | chart: **needs Part 5 data** |
| Positions | symbol, qty, avg cost, last, value, P/L, cash and P/L in the header | the same columns; P/L = (last − avg cost) × qty; cash and buying power in the header | matches | avg cost is from booked fills |
| Ticket | Buy/Sell, Market/Limit, stepper, estimated cost, buying power → after, primary button | Buy only: stepper, estimated cost, held in reserve, buying power before → after, "Buy N SYMBOL · $X" | differs | Sell and Limit: **out of scope** (the lifecycle has market buys only) |
| Active order | step timeline: reserve, sent, fills, settled; Cancel | the same steps from `trading.order_events`; "Cancel requested…" has its own words, glyph and border; Esc asks to cancel with a confirm | matches | shows the latest order, "Last order" once finished, so an order that fills at once is still seen |
| Recent fills | time, side, qty, symbol, price | the last 10 booked fills | matches | |
| Shortcuts | B, S, Esc, ? | B, Esc, ? ; none fires while typing, Esc included | differs | no S: **out of scope** (no sell). Esc differs from the design's "except Esc" by request |
| Footer | "IEX via Alpaca · Coinbase" | CoinGecko and Alpha Vantage, end of day | differs | **data honesty** |
| Stale / reconnecting / offline banners | shown | the existing per-feed words | differs | **out of scope** |
| Light, dark, colour-blind palette, reduced motion, focus | | axe clean in both themes at 1440 and 390; 44 px controls; ember focus; the pending pulse stops under reduced motion | matches | |

## Left for Part 5

Live stock prices and the stale, reconnecting and offline banners; price history, charts and sparklines; Sell and Limit; ETH and SOL; "Under the hood"; season name and end date;
company names; an intraday "today" change and equity history.
