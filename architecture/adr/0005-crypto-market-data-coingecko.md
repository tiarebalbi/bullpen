# ADR-0005: Crypto prices from CoinGecko

## Status

Accepted

## Date

2026-09-26

## Summary

BTC-USD from CoinGecko, with credit

## Part

1

## Context

Issue #6 (one live symbol) originally proposed the Coinbase Exchange public
REST API for BTC-USD. Before writing any code against it, I read Coinbase's
[Market Data Terms of Use](https://www.coinbase.com/legal/market_data),
which forbid redistributing or displaying Market Data — including from the
free/public Exchange endpoints — to any third party outside the operator's
own organization, and forbid building an application for end users other
than the operator. A public Bullpen page serving BTC-USD prices to visitors
is exactly the use those clauses block. Full detail in
`docs/data-sources.md`. That ruled Coinbase out under this project's own
guardrail ("if the market-data terms forbid public display, stop"), leaving
issue #6 blocked pending a replacement provider whose terms explicitly
permit public display with attribution.

## Decision

Use CoinGecko's free Demo API (`api.coingecko.com/api/v3`) for BTC-USD.
`docs/data-sources.md` records the terms version read (5 Sept 2025), the
attribution rule, the no-redistribution clause, the cache-refresh rule, and
the Demo plan's limits.

## Consequences

- **Attribution is mandatory on every screen that shows a price**: a
  visible "Powered by CoinGecko" (or an approved equivalent) credit,
  legible font no smaller than 10px, linked to coingecko.com, placed
  directly above or below the price. This is a hard requirement of the
  terms, not a design nicety — omitting it would put Bullpen out of
  compliance.
- **Prices are up to ~5 minutes old.** CoinGecko's own Demo-tier data
  refreshes roughly every 1–5 minutes upstream, and Bullpen's own route
  caches for 300s on top of that. The page must show this honestly (an "as
  of `<time>`" label, a stale state past 10 minutes) rather than implying
  tick-level freshness the source doesn't provide.
- **A hard monthly call budget** (10,000 calls/month, 100/min on the Demo
  plan) that Bullpen's own polling interval must respect with margin — see
  the budget fitness check in `architecture/fitness/`, which fails
  `check:arch` if the configured cache interval would push modeled monthly
  usage over 90% of the allowance.
- **No redistribution**: the route always returns Bullpen's own
  `{ symbol, price, time, source, fetchedAt }` shape, never the raw
  upstream payload, and the CoinGecko API key stays server-side only.
- If Bullpen later needs sub-minute freshness or higher call volume, this
  decision needs revisiting (a paid CoinGecko tier, or a different
  provider) — flagged here rather than assumed solved.

## Alternatives

All researched and rejected — see `docs/data-sources.md` for the primary
Coinbase finding; the rest were assessed against the same requirement
(public display permitted, with attribution, at no cost for Part 1's
scale):

- **Coinbase Exchange public API** — rejected. Terms forbid public
  display/redistribution outside the operator's own org (see Context
  above and `docs/data-sources.md`).
- **Kraken public API** — rejected. Its API terms carry a similar
  no-redistribution-to-third-parties posture for market data absent a
  separate data license, the same shape of restriction that ruled out
  Coinbase.
- **Binance public API** — rejected. Aimed at trading-bot/algo use, not
  redistribution to end users of a third-party public site; no free tier
  attribution path suited to public display.
- **CryptoCompare (CCData)** — rejected for Part 1: free tier is
  rate-limited and geared toward evaluation, with attribution and
  commercial-use terms that would need a paid plan to clear for public,
  ongoing display.
- **Pyth Network** — rejected for Part 1: an oracle feed built for
  on-chain/DeFi consumption, not a simple REST price-snapshot API; adds
  integration complexity (on-chain reads or a pull-oracle client) with no
  benefit for a single BTC-USD display value at this stage.

## Links

- Issue #6 (one live symbol) — this ADR resolves its blocker.
- `docs/data-sources.md` — full terms text and links for every source
  evaluated, including this one.
- ADR-0002 (why distribute at all) — the price-snapshot service stays a
  single serverless function calling out to this provider; no separate
  ingestion service yet.
