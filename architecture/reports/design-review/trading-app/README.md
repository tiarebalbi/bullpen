# Trading app: design review (Track B)

Branch `post-04-saga`. Reviewed 2026-10-20 (frames captured about 2026-10-21T06:00Z). Screens in scope: the order ticket (desktop rail, phone bar and sheet), the seven order
states, the portfolio, the orders list, the leaderboard row for the signed-in player, and the colour-blind palette toggle.

## How the frames were made

- **The design**: `Bullpen Terminal.dc.html` and `Bullpen Mobile Trading.dc.html` from the committed export `design/export-2026-09-25-final`, served from a local static server, with the design's own
  Dark and Light buttons. Files: `design-desktop-{dark,light}-terminal.png`, `design-mobile-{dark,light}-mobile-trading.png`.
- **The app**: the production build of this branch (`next build`, `next start`), with every route answered at the browser network layer by `apps/web/e2e/trading-orders.spec.ts`. The accounts in those answers are
  fixtures made in that file, so no page shows invented data and no database was touched. Files in `app/`, named `<state>-<width>.png`, at 1440 and 390 px; `trading-dark` and `trading-light` are the same
  screen in both themes. Command: `SCREENSHOT_DIR=<dir> pnpm --filter @bullpen/web exec playwright test e2e/trading-orders.spec.ts e2e/trading-screens.spec.ts`.
- The design is a clickable prototype with sample numbers, the app is a page of real states, so the comparison is of structure, copy and behaviour, not of the numbers.

## Section by section

| Screen | Matches / differs | Why |
|---|---|---|
| Rail: ticket in the right column, Quantity field, estimated cost, buying power, one primary button | matches in structure | `app/trading-dark-1440.png` against `design-desktop-dark-terminal.png` |
| Buy/Sell tabs, Market/Limit tabs, limit price, +/- stepper, keyboard shortcuts | **differs** | the lifecycle has market buys only (decided 2026-10-20), so the ticket has no Sell, no Limit and no limit price. The heading says "Market buy · AAPL" instead |
| "Buy 10 NVDA · $1,825.80" on the button, the buying-power arrow and bar | differs | the button says "Buy AAPL" and the cost sits above it with the 5% reserve ("Held in reserve") beside it, because the reserve is what leaves buying power while the order is open |
| Header: equity, today's gain, rank | **not built** | equity is in the portfolio card; "today" needs a day-open value and rank needs a position in a live ranking the header does not poll. Neither is shown rather than approximated |
| Chart, positions with average cost and P/L | differs | there is no price history (an empty state says so, as before); positions show quantity, last price and value, and "No price" when a symbol has none. Average cost and P/L are not in the account view |
| "Active order" timeline and "Recent fills" | differs | replaced by the Orders list, where each order shows the state, what filled, and what came back |
| Order states | matches the wording, adds two | the design's Working, Partially filled, "Cancel requested…" with "Waiting for the fill engine to confirm.", Cancelled with the filled count and "back in buying power", Rejected. Accepted and Filled complete the seven the lifecycle has (ADR-0017) |
| Mobile: the ticket as a bar pinned to the bottom | matches | one line (buying power, or why it is off) and one button. The design opens a full ticket; the app opens the same ticket in a native `<dialog>` sheet, which traps focus and closes on Escape |
| Signed out | differs (the design has no signed-out state) | the ticket is an invitation ("Sign in to trade", one button), not a disabled form. The portfolio and orders are not drawn at all |
| Preview deployments | differs (no design) | the ticket says sign-in is not available here and shows no form; the phone bar says "Sign-in is off on previews" |
| Colour-blind palette | matches the tokens, adds a control | the design has a "Color-blind safe" switch; the app has a "Colour-blind palette" button in the header that sets `data-cb` on `<html>` and is remembered in this browser only |

## The seven states, and "cancel requested" against "cancelled"

`app/orders-seven-states-1440.png` and `-390.png` show all seven, produced from fixtures shaped like the real lifecycle's output (the lifecycle itself produces each of them in
`architecture/fitness/src/db-integration/orders-player.int.test.ts`, and that test also checks every view against the account-view contract).

| State | Words | Glyph | Border |
|---|---|---|---|
| accepted | Accepted | ○ | dotted |
| working | Working | ◐ | solid |
| partially_filled | Partially filled | ◑ | solid |
| cancel_requested | Cancel requested… | ⧖ | dashed, 2 px, italic, ember |
| cancelled | Cancelled | ✕ | double, 4 px, muted |
| filled | Filled | ● | solid, gain colour |
| rejected | Rejected | ! | solid, loss colour |

A request is not a cancel: the order stays open for fills until the venue confirms (ADR-0017), so the "Cancel requested…" row keeps saying how much has filled, offers no second Cancel, and
never says money is back. The e2e test compares the computed border style, width and font style of the two badges and fails if they are equal.

## Accessibility

- **axe** (`@axe-core/playwright` 4.14.0, added as a dev dependency): zero violations in dark and light at 1440 and 390, with all seven states on screen, the ticket selected, and, on the phone, with the sheet open.
  Command: `pnpm --filter @bullpen/web exec playwright test e2e/trading-orders.spec.ts`.
- Two findings were real and are fixed: watchlist rows were named by an `aria-label` that dropped words the row shows (label-content-name-mismatch; the label is gone and the row is named by its own words),
  and the trade bar sat outside any landmark (it is now a `region` named "Trade bar"). A third showed up only under load: the "Cancel requested…" badge pulsed its opacity, which dipped its text below readable
  contrast for an instant. It now pulses only its border, and the pulse stops under `prefers-reduced-motion` (tested).
- **Targets**: every button the player presses (Buy, Sign in, Trade, Close, Cancel order, Colour-blind palette) is at least 44 px tall; the test measures them.
- **Keyboard path through the ticket**, tested at both widths: focus the symbol in the watchlist, Enter; (phone: Tab to "Trade", Enter opens the sheet); Tab to Quantity; type; Tab to "Buy AAPL"; Enter. One POST goes out with a
  key and the order appears under Orders. The ticket also refuses (and says why) a quantity that is not a positive number with at most 8 places, or one the buying power cannot cover with the 5% reserve.
- **Colour does not carry a state**: the badge has words and a glyph; borders and fills only echo them. The colour-blind palette changes the filled and rejected colours (tested) and leaves the words.
- **Reduced motion**: the one animation (the pending pulse) is off; the sheet has no entrance animation.
- **No horizontal scroll** at 390 (tested).

## Not reviewed

- Lighthouse for the trading app was not run in this pass.
- A real signed-in session against the deployed domain was not exercised: sign-in needs the owner's Neon Auth settings (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`) in Vercel production and a GitHub sign-in by the owner. What is tested is the app's behaviour for each answer the
  order routes can give, the routes against a real Postgres (`apps/web/app/api/orders/route.test.ts`, the db-integration suite), and the verifier with a locally signed token.
- The 3 s polling cadence was tested as a function (`useAccount.test.ts`), not watched over minutes in a browser.
