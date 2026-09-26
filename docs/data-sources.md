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

## CoinGecko Demo API — chosen

Decision: BTC-USD live price comes from CoinGecko's free Demo API. Chosen
directly by Tiare after Coinbase was ruled out; see ADR-0005 for the full
record (context, consequences, rejected alternatives).

Read 2026-09-26:

- **Terms:** [API Terms of Service](https://www.coingecko.com/en/api_terms),
  latest version **5 Sept 2025**.
- **Attribution rule:** "you shall duly attribute ownership of the CoinGecko
  API to CoinGecko by displaying prominently the message 'Powered by
  CoinGecko' in a legible font ... no smaller than font size 10." The
  [attribution guide](https://brand.coingecko.com/resources/attribution-guide)
  additionally requires the credit be placed "close to where the data is
  displayed, i.e. above or below the data set," linked to
  `https://www.coingecko.com` or `https://www.coingecko.com/en/api`, and
  forbids claiming a partnership ("we partner with CoinGecko," etc.) or
  altering the CoinGecko logo.
- **No-redistribution clause:** "you are not permitted to sell, rent, lease,
  sub-license, re-distribute or syndicate access to the CoinGecko API or part
  thereof." Bullpen's route only ever returns Bullpen's own one-symbol shape,
  never the raw upstream payload, to stay inside this.
- **Cache-refresh rule:** "You should refresh the cache at least every 24
  hours" — i.e. a maximum staleness bound. Bullpen's 300s (5 min) cache is
  far inside that.
- **Demo plan limits**, from the
  [pricing page](https://www.coingecko.com/en/api/pricing): **10,000 calls
  per month**, **100 calls/min**, upstream data itself refreshed roughly
  every 1–5 minutes, no historical depth needed for this use.
- **Checked and ruled out:** a same-session first-pass read misreported a
  "no commercial use" restriction on the Demo plan. Re-verified with an
  exact-quote fetch against both the terms and pricing pages — that
  restriction does not exist in either document. Not a blocker.

## Next step

None — the CoinGecko Demo integration is implemented in `apps/web` (issue
#6). `architecture/calm/moments/part-01.architecture.json`'s external system
node has been updated from the "Market Data Provider" placeholder to
CoinGecko.
