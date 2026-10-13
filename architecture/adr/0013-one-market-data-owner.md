# ADR-0013: One Market Data owner

## Status

Proposed

## Date

2026-10-13

## Summary

Prices and History merge under one Market Data owner

## Part

3

## Context

Week one predicted that Part 3 would split the price snapshot service into a
Prices service and a Market History service, each with its own Neon database
(`architecture/calm/planned/part-03.architecture.json` at the tag
`predictions-week-1`).

Building it showed one writer and one budget. Stock prices are end of day from
Alpha Vantage, which allows 25 requests a day on its free key; crypto comes
from CoinGecko, which allows 10,000 calls a month. One ingest writes every
price and keeps every quote, so "current price" and "history" are the same
rows read two ways. ADR-0002 names a limit that every instance draws from and
only one owner can manage as a shared budget, which is a reason to have one
owner, not two.

## Decision

Market data has one owner: one module and one Vercel Service, `market-data`,
owning both providers, both call budgets and the `market_data` schema. Prices
and history merge. Stock data is end of day, fetched once a day by that owner;
crypto moves under the same owner, with the public price URL kept by a
rewrite.

## Consequences

- The week-one prediction is reversed: no Prices service and no Market History
  service, and no database for each. The prediction stays at the tag; Part 6
  compares it with what shipped.
- One call ledger counts every provider call, so the cap holds under concurrent
  callers.
- Trading and the leaderboard read prices only through `market_data.prices_v1`
  (ADR-0012).
- If a second consumer needs price events, or history grows a different access
  pattern, splitting history out is a new decision with its own evidence.

## Alternatives

- **Separate Prices and Market History services** (the prediction) — rejected.
  One writer and one budget would be divided across a hop that buys no
  independent change.
- **Keep crypto in the trading app** — rejected. Two owners of "price" would
  each need to respect a budget only one of them can see.

## Links

- ADR-0002 (why distribute at all), ADR-0005 (CoinGecko), ADR-0008 (Alpha
  Vantage), ADR-0012 (data ownership).
- tag `predictions-week-1` — the prediction this reverses.
