# ADR-0025: The price contract carries the previous close

## Status

Accepted

## Date

2026-10-22

## Summary

The price contract adds the previous stored close

## Part

4

## Context

The trading app's watchlist, in the Terminal design, shows each stock's change since the last close. `market_data.prices_v1` returns one row per symbol, the
latest, so the trading owner could not read two closes: ADR-0012 and ADR-0013 allow it to read market data only through that view. Without a second close
the app can show no change at all; with a made-up one it would break the rule that no deployed page shows invented numbers.

## Decision

`market_data.prices_v1` gains two columns, last, after `kind` (ADR-0024): `previous_price` and `previous_as_of`, the quote stored just before the latest one
for the symbol (`lag` over `as_of`), or NULL when only one is stored. The existing columns and the grant are unchanged, so a reader that names its columns keeps working.

- A reader shows a change only when both closes exist: `GET /api/stock-prices` returns `previousClose: { price, asOf } | null`, and the watchlist draws
  "▲ +1.67%" only for a symbol that has it. With one close stored it draws nothing, not a zero.
- "Previous" means the previous **stored** close. If an ingest day was missed the change spans two trading days; the row's own date (`Close · Oct 16`) is
  shown, and the previous close's date is in the response. The view does not claim a consecutive trading day.
- The change is in migration `0002_quotes_and_price_contract.sql`, like ADR-0024's column and for the same reason: every migration re-runs on every build, so
  the view is defined once, in its final shape.

## Consequences

- The view does a window function over `market_data.quotes`. The table holds one row per symbol per trading day, so the cost is small; it must be looked at if
  intraday quotes are ever stored (Part 5).
- Equity "today" is still not shown: there is no intraday equity history, and a change in a price is not a change in the player's equity.

## Alternatives

- **A second view (`prices_history_v1`).** A wider contract, a new grant and new ADL rules, for one extra value per symbol.
- **Show no change.** Honest, but leaves the design's row without the one number the data can already support.

## Links

- ADR-0013 (one market-data owner) — the contract this widens.
- ADR-0024 (freshness depends on the price kind) — the column added before it, in the same migration.
