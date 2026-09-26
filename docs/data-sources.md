# Market data sources

## Coinbase Exchange public REST API — rejected

The brief for this build proposed `GET https://api.exchange.coinbase.com/products/BTC-USD/ticker`
(no API key, public endpoint) for the Part 1 live symbol.

Before writing any code against it, we read Coinbase's
[Market Data Terms of Use](https://www.coinbase.com/legal/market_data)
(last updated 2023-02-06). They govern all data made available via Coinbase,
including the free/public Exchange endpoints — there is no carve-out for
unauthenticated access. Two clauses block this project's use case directly:

> Your use of Market Data is exclusively for you or your entity's personal or
> research purposes and may not be used to build an application intended for
> use by end users other than for you or your officers/employees.

> Absent prior express written consent from Coinbase, you may not: ...
> Redistribute, display, or disseminate the Market Data — or any data,
> charts, analytics, research, or other works based on, referring to, or
> derived from the Market Data ("Derived Works") — to any third party
> outside of your organization by electronic means or otherwise.

Bullpen is a public leaderboard/trading page serving prices to visitors —
exactly what both clauses prohibit. Per this project's own guardrail ("if
the market-data terms forbid public display, stop"), we stopped: the live
BTC-USD feature (issue #6) is on hold until an alternative source is chosen
whose terms explicitly permit public display with attribution.

Confirmed separately, for future reference: the endpoint itself is fully
open (200 with or without a `User-Agent` header), and public rate limits are
10 req/s with a burst to 15, per IP
([docs.cdp.coinbase.com/exchange/introduction/rate-limits-overview](https://docs.cdp.coinbase.com/exchange/introduction/rate-limits-overview)).
Neither of those is the blocker — the terms of use are.

## Next step

Needs a decision on a replacement provider before `apps/web`'s price route
and page are implemented. `architecture/calm/moments/part-01.architecture.json`
uses a placeholder "Market Data Provider" external system until then.
