# ADR-0008: U.S. stock prices from Alpha Vantage, end of day

## Status

Accepted

## Date

2026-09-26

## Summary

Alpha Vantage for end-of-day stock prices

## Part

3

## Context

Part 1's live symbol is BTC-USD only (ADR-0005). Part 3 is the first point at
which U.S. stock prices need a real upstream instead of the "Market Data
Provider (TBD)" placeholder.

Alpha Vantage's free API key gives end-of-day U.S. stock prices, one symbol
per request, with a limit of 25 requests a day. I read its
[Terms of Service](https://www.alphavantage.co/terms_of_service/): they allow
the public display Bullpen needs. `docs/data-sources.md` records the terms
version read and the limits.

## Decision

Use Alpha Vantage's free tier (`www.alphavantage.co/query`, the `GLOBAL_QUOTE`
endpoint) for U.S. stock end-of-day prices. One owner fetches them, once a day
(ADR-0013).

## Consequences

- **Prices are as of the latest close.** The source is end of day only, not
  intraday or real time, so a price carries its as-of date, and a price older
  than its expected cadence is marked stale.
- **A hard daily budget of 25 requests**, far tighter than CoinGecko's. The one
  owner of market data keeps a call ledger and caps its own calls below the
  limit, so a retry or a manual re-run still fits.
- **The data source is credited** wherever its prices are shown, matching the
  pattern from ADR-0005.
- The planned moments and the explorer call this provider by the generic label
  "Stock data provider"; the moment that builds it names Alpha Vantage.

## Alternatives

- **Alpaca** — not part of the plan. Ruled out as a decision, independent of
  this ADR's terms question.
- **Finnhub** — not used. It would need its own ADR before appearing as a
  provider anywhere.
- **Databento** — considered for its clear commercial licensing, not used for
  Part 3: priced for production trading-data volumes, not a single end-of-day
  symbol lookup at Bullpen's current scale.

## Links

- ADR-0005 (crypto prices from CoinGecko) — the same terms-of-use guardrail,
  applied to Coinbase.
- `docs/data-sources.md` — the terms and limits of every source evaluated,
  including this one.
- `cost/allowances.json` — the free key's 25 requests a day.
