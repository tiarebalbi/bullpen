# Trading app, design alignment after Part 5: design review

Ours is `app/*.png` at 1440 and 390 px. The states are the ones the design draws that the earlier review (`../trading-app-polish/README.md`) left out. They come from two specs in
`apps/web/e2e`, run from `apps/web` with the pictures kept:

```
SCREENSHOT_DIR=<dir> pnpm exec playwright test e2e/trading-link.spec.ts e2e/design-alignment.spec.ts --trace off
```

Every route is answered at the browser's network layer and the clock is pinned, so each picture is the same on every run. Axe runs on each state at both widths in light and dark (on a phone the
open ticket sheet covers the theme toggle, so there it checks the current theme). The design is the export in `design/export-2026-09-25-final/`: `Bullpen Design System.dc.html`
(ConnectionIndicator, TicketGuard, Status), `Bullpen Terminal.dc.html` and `Bullpen Mobile Trading.dc.html` (`banner`, `quoteRow`). Pixel spacing was matched through the shared tokens, not measured.

| Area | Design | Ours | Verdict | Reason |
|---|---|---|---|---|
| Banner, reconnecting | a strip under the header (a card on a phone), ◌ in the warning tint: prices frozen and labeled, orders wait for live quotes | the same strip, `banner-reconnecting-*.png`: "Reconnecting to market data. Prices shown are the last received, at 11:00:02. Orders still use the latest stored price." | differs | **data honesty**: an order does not wait for live quotes here; the server prices it from the stored close |
| Banner, offline | ✕ in the destructive tint, with a countdown and Retry now | the same, `banner-offline-*.png`: "You're offline." (or "Prices are unavailable." when the app answered 503), "No prices have arrived yet. New orders are refused safely until the app answers; nothing is reserved.", "Retrying in N s.", Retry now | differs | **data honesty**: offline means there are no prices to freeze, so "frozen and labeled" would be false |
| Banner, stream switched off or polling | none | none: prices are arriving, so it is the indicator's Delayed, not an alarm | matches | |
| Indicator: Live, Delayed, Stale, Reconnecting, Offline | five states, each with its own glyph and words | the same five, from the price link's real state | matches | |
| Indicator: details | "attempt 2 of 5", "retry in 8 s", Delayed "15 min" | "stocks · attempt N of 3", "retry in N s" with Retry now, Delayed "refreshes every 10 s" or "live prices paused", `indicator-*.png` | differs | **data honesty**: the screen polls after 3 failed attempts, and the delay is the poll's, not a 15-minute quote delay |
| Indicator: closed market | "closed · Mon 9:30 ET" | the same words while the link is live or stale | matches | the e2e cannot hold an event stream open, so this is covered by `LiveBadge.test.tsx` |
| TicketGuard: priority | waiting for prices, shortfall, oversell, stale price, market closed; one at a time | one component, waiting, shortfall, stale, closed; the confirm label changes with it | differs | oversell: **out of scope** (no sell) |
| TicketGuard: shortfall | "$11,653.88 more than your buying power", "336 NVDA fits in $61,358.12.", Set quantity to 336 | "$95.89 more than your buying power", "10 AAPL fits in $2,100.00, with the 5% reserve.", Set quantity to 10; both numbers are exact decimals, on the server's own arithmetic (cap = price × 1.05 to 8 places), `ticket-shortfall-*.png` | matches | the 5% reserve is named because the amount is what the server holds |
| TicketGuard: stale price | "NVDA's price is 22 s old", "A market order fills at the next live price.", Refresh quote | "AAPL's price is stale", "Last priced Nov 6. Orders are refused until a fresh price is stored.", no button, `ticket-stale-guard-*.png` | differs | **data honesty**: the stored close is end of day; nothing refreshes it, and the server refuses an order against a stale one (ADR-0024), so no "refresh" or "buy anyway" |
| TicketGuard: waiting for prices | first in the priority | written and tested, shown only while the price link is offline | differs | **data honesty**: offline means no prices, so no stock row exists to select; the guard cannot be reached from the screen today and is covered by unit tests only |
| TicketGuard: market closed | ☾ "Stocks are closed", "A market order queues for the open, Mon 9:30 ET." | the same words; the desktop copy's "opening price" and "crypto trades now" are not used | matches | **data honesty**: the order is filled at the stored price, and the ticket is for stocks |
| Confirm label | changes with the guard | "Waiting for prices", "Not enough buying power", "Price is stale", "Queue buy for the open · $1,000.00" | matches | |
| Watchlist row, stale | ◷ and the time, price and change in the stale tone, dashed badge and sparkline | ◷ Stale · date in the stale tone, price in the stale tone, dashed badge, `watchlist-stale-row-*.png` | differs | sparkline: **needs data** (no price history is stored) |
| Watchlist row, stale while closed | the closed market wins over stale | a stale close stays stale | differs | **data honesty**: a missed close is not a close |
| Queued order | the order row names when it goes | "Queued for the open (Mon 9:30 ET)", ☾ with no animation, with or without reduced motion, `market-closed-queued-order-*.png` | matches | |
| Switched off: leaderboard | Status "Paused ❚❚" | "❚❚ Paused" and "The ranking is not refreshing right now. This is the last good one, from 16:00:00.", `leaderboard-paused-*.png` | matches | |
| Switched off: price stream | Paused | the indicator's "live prices paused" | matches | |
| Switched off: handle moderation | no screen | after saving: "Automatic checks are paused right now, so a person reviews every handle." | differs | **data honesty**: no model checked the handle, so the screen does not say it was checked; the design has no copy for this |
| Chart | a price chart | an empty state: "A chart needs price history, which Bullpen doesn't store yet." | differs | **needs data**; the empty state no longer promises a part of the series |
| Sheet on a phone | the ticket fits the sheet | fits; a rule meant for the locked bar's own buttons had been reaching the open sheet and pushing the stepper out of it | matches | found by this review's screenshots; one selector, with a test |
| Reduced motion | the moon and the guards appear without motion | no animation on either; the pending pulse stops | matches | |

## Data honesty calls

1. The banner never says prices are frozen or that orders wait for live quotes; both are false here.
2. The delay is the polling fallback's ("refreshes every 10 s"), not a 15-minute quote delay, and the attempt count is 3, the real policy.
3. The stale guard offers no refresh and no "buy anyway": the stored close is not refreshed by the screen, and the server refuses a stale price.
4. A stale close stays stale when the market is closed.
5. "Waiting for prices" exists only while the link is offline, and is not reachable from the screen: nothing is selectable without prices.
6. Paused moderation says no automatic check ran. The screen reads these from the routes' answers (`refresh`, `moderation`, `x-bullpen-stream`), never from the switch variable.
7. The closed guard leaves out "opening price" and "crypto trades now".

## Left after Part 5

Price history, charts and sparklines; Sell, Limit and the oversell guard; ETH and SOL; company names; "Under the hood"; the season name and end date; an intraday "today" change and equity
history; a way to reach "Waiting for prices" (it needs a stock the screen can select while no prices have arrived).
