# ADR-0023: How fresh a price must be depends on its kind

## Status

Proposed

## Date

2026-10-22

## Summary

Live prices age out in 5 minutes, closes by the contract

## Part

4

## Context

ADR-0017 has the simulated venue fill only at a price at most `MAX_FILL_PRICE_AGE` (5 minutes) old, and has the sweep cancel an order with no fill after `WORKING_DEADLINE` (15 minutes). A stock price in
Bullpen is a close: the stock ingest stores one price a trading day, as of 16:00 New York (`apps/market-data/src/ingest.ts`, ADR-0008). By the time anyone buys, that price is hours old, so the venue held
every stock market buy and the sweep cancelled it 15 minutes later with `no-fillable-price`.

This happened in production. Three real orders were cancelled this way, **AMZN 90, V 12 and AAPL 3** (as reported by the owner on 2026-10-22; the order ids and times were not read from the database for this
ADR). Each reservation came back correctly, so no money was lost: the invariants held, the orders were simply never fillable.

It passed locally because every order test seeded a price a few seconds old (`orders-harness.ts`), which is the one case the 5-minute rule was written for. The submit-time check never had this problem: it
refuses a price the price contract flags `stale` (`valid_until`, set at ingest from the symbol's cadence: `stockValidUntil` is the end of the next trading day). So the app accepted a buy at a close
the venue then refused to fill. Two freshness rules, one of them wrong for stocks, and nothing tying them together.

## Decision

Freshness depends on the price's kind, and the venue's rule for a stock is the rule submit already uses.

- **The price contract says which kind a price is.** `market_data.quotes` gains `kind` (`'live'` or `'end-of-day'`, default `'live'`), and `market_data.prices_v1` gains it as its last column; the columns it had and
  the grant are unchanged, so a reader of the contract keeps working. The stock ingest stores `'end-of-day'`; rows already stored by the `alphavantage` source are backfilled to it. The change is in
  migration `0002_quotes_and_price_contract.sql` (every migration re-runs, so the column is added before the view that lists it).
- **A live price keeps the 5-minute limit** (`MAX_FILL_PRICE_AGE_MS`), and is refused when the contract flags it stale.
- **An end-of-day price is fresh when the contract does not flag it stale**, which is when it is the close of the latest completed trading day: `valid_until` is the end of the next trading day, so a Friday close
  is current through Monday and a close before a Monday holiday through Tuesday. A market buy then fills at that close. **Stale still means older than that**, and the buy is refused at submit with `stale-price`, as today.
- **One function decides, in both venues.** `isFillable` in `packages/db-trading/src/orders/venue.ts` is used by the simulator (`SimulatedVenue`) and by the derived venue the app actually runs (`DerivedVenue`).
  The trading package does not compute trading days itself: that would be a second calendar that can disagree with the one that sets `valid_until`, which is this bug again.
- **`WORKING_DEADLINE` is unchanged** (15 minutes, ADR-0017, ADR-0021). It stays the deadline for an order with no fillable price; the change is that a stock order now has one.
- **The tests can no longer pass here and fail there.** `orders-end-of-day.int.test.ts` seeds stock prices the way the ingest stores them (a close 20 hours old, a Friday close 68 hours old, a close past `valid_until`) and runs the derived
  venue through `placePlayerOrder`, `advanceAccount` and `sweep`: an end-of-day order fills; a close older than the latest completed trading day is refused at submit and writes nothing; and the 15-minute cancel does not
  fire on a fillable stock order, while it still fires on a live price older than 5 minutes. The simulator is covered by an end-of-day case too. The ingest test asserts the kind it stores.

This supersedes only the "Fill price" paragraph of ADR-0017. ADR-0017 is not edited.

## Consequences

- A stock market buy fills at the last close, as the player was told when the buy was accepted. The price is not live: the product shows an end-of-day price and the fill is at that price, so a player buying at 11:00 gets
  yesterday's close.
- The price contract is wider by one column. A consumer that selects `*` from `prices_v1` sees it; the two readers in `packages/db-trading` name their columns.
- **A gap this does not close:** between the 16:00 close and that evening's ingest, the previous close is still current under the contract, so submit accepts and the venue fills at it. That is today's submit
  behaviour, which this keeps. Tightening it ("the latest completed trading day" counted from 16:00) is a change to `valid_until`, that is to the contract, and would need its own ADR.
- Crypto is unchanged: it has no stored quote, and a live price keeps the 5-minute limit.
- The classification is data, not a rule in the venue: a future end-of-day source sets `kind` at ingest and needs no change here.

## Alternatives

- **Raise `MAX_FILL_PRICE_AGE_MS` to cover a long weekend** (about 3.5 days): fills stocks, but also lets a live price three days old be filled at, and keeps two freshness rules that can disagree.
- **Fill only during market hours and compute "the latest completed trading day" in the venue:** needs a trading calendar in `packages/db-trading` (the calendar lives in `apps/market-data`, a different owner, ADR-0013), a second copy of the
  holiday rules, and a way for it and `valid_until` to drift apart.
- **Tell the kind from `source`** (`alphavantage` means end-of-day): needs no migration, but test rows must carry `source = 'test'` (`TEST_QUOTE_SOURCE`) so the cleanup and the pages can find them, so an end-of-day test could not be
  expressed without breaking that marker, and a second end-of-day provider would be a change to the venue.
- **Cancel nothing, remove the working deadline for stocks:** hides the cause. An order with no fillable price should still be cancelled.

## Links

- ADR-0017 (the order lifecycle as a Postgres state machine) — its "Fill price" paragraph is what this supersedes.
- ADR-0021 (the sweeper's idle wait is sixty minutes) — leaves `WORKING_DEADLINE` as it is, as this does.
- ADR-0008 (Alpha Vantage stock prices) — where the end-of-day price comes from.
- ADR-0013 (one market-data owner) — the contract that gains `kind`.
- `architecture/reports/part-04/post-facts.md`, section 14 — what happened.
