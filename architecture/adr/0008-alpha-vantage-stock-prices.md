# ADR-0008: U.S. stock prices from Alpha Vantage, end of day

## Status

Proposed

## Date

2026-09-26

## Summary

Alpha Vantage proposed for stocks; permission pending

## Part

3

## Context

Part 3 splits the price-snapshot service into a Prices Service and a Market
History Service, each with its own database. Part 1's live symbol is
BTC-USD only (ADR-0005); Part 3 is the first point U.S. stock prices need a
real upstream instead of the "Market Data Provider (TBD)" placeholder.

Alpha Vantage's free API key is proposed: end-of-day (prior close) U.S.
stock prices, 25 requests/day. Real-time data needs a paid plan plus a
separate exchange-entitlement process.

Before treating this as decided, I read the Alpha Vantage
[Terms of Service](https://www.alphavantage.co/terms_of_service/).
Section 2.a licenses the free key for "personal, non-commercial use"
only, and defines "commercial use" to include:

> "You plan to use or provide information accessed through the Alpha
> Vantage Platform as part of any type of commercial activity that allows
> individuals or entities other than User to access information directly
> or indirectly even if the scope of such activity falls outside of the
> securities industry."

A public Bullpen page showing stock prices to visitors plausibly falls
under that clause — the same shape of restriction that ruled out Coinbase
in ADR-0005. Commercial terms exist but require contacting
`premium@alphavantage.co`. I emailed that address 2026-09-26; no written
reply covering public display has arrived yet. Per this project's own
guardrail ("if the market-data terms forbid public display, stop"), this
ADR stays **Proposed**, not Accepted, until that reply arrives. No page
names Alpha Vantage as the resolved provider while this is pending — see
Consequences.

## Decision

Propose Alpha Vantage's free tier (`www.alphavantage.co/query`) for U.S.
stock end-of-day prices, pending written permission for public display.
`docs/data-sources.md` records the terms version read, the pending-request
date, and the free tier's 25 requests/day limit.

This ADR moves to Accepted only once Alpha Vantage's written reply
confirms this public, non-commercial use is permitted on the free tier —
or once a paid/commercial arrangement is reached instead.

## Consequences

- **No page names Alpha Vantage as the resolved stock data provider while
  this ADR is Proposed.** The Part 3+ architecture explorer and CALM
  planned moments show a generic "Stock data provider" external system
  (description: "Alpha Vantage proposed, pending permission"), and the
  landing footer reads "U.S. stocks arrive in Part 3" rather than naming a
  provider. This keeps every public page honest about what's actually
  confirmed, matching this project's "no invented data on any deployed
  page" guardrail.
- **Prices, once resolved, are as of the prior close** — the free tier is
  end-of-day only, not intraday or real-time.
- **A hard daily call budget** of 25 requests/day on the free tier, far
  tighter than CoinGecko's Demo allowance; Bullpen's own polling/caching
  design in Part 3 will need to respect this with margin.
- **A credit line is required** wherever prices are shown, matching the
  CoinGecko pattern from ADR-0005, once a provider is actually confirmed.
- If written permission is refused or doesn't arrive, this decision needs
  revisiting — Finnhub or Databento (see Alternatives) or a paid Alpha
  Vantage plan — flagged here rather than assumed solved.

## Alternatives

- **Alpaca** — not part of the plan. Ruled out as a decision, independent
  of this ADR's terms question.
- **Finnhub** — a possible second source; permission requested 2026-09-25,
  not used until granted. Would need its own ADR before appearing as a
  resolved provider anywhere.
- **Databento** — considered for its clear commercial licensing, not
  pursued for Part 3: priced for production trading-data volumes, not a
  single end-of-day symbol lookup at Bullpen's current scale.

## Links

- ADR-0005 (crypto prices from CoinGecko) — the prior instance of this same
  terms-of-use guardrail, applied to Coinbase.
- `docs/data-sources.md` — full terms text and links for every source
  evaluated, including this one.
- `cost/allowances.json` — the free tier's 25 requests/day allowance.
