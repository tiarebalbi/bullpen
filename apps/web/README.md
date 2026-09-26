# @bullpen/web

The trading app. Part 1 ships one live symbol: BTC-USD, from CoinGecko's
free Demo API (see ADR-0005 and `docs/data-sources.md`).

## Local setup

1. Get a free CoinGecko Demo API key: sign up at
   https://www.coingecko.com/en/developers/dashboard and create a "Demo"
   key from there. No credit card required.
2. Copy `.env.example` to `.env.local` and set `COINGECKO_DEMO_API_KEY` to
   that key. `.env.local` is gitignored — never commit it, and never paste
   the key anywhere else (logs, commit messages, etc.). The route
   (`GET /api/price/[symbol]`) reads it server-side only and never returns
   it in a response body.
3. `pnpm dev` from the repo root, or `pnpm --filter @bullpen/web dev`.

## Price route

`GET /api/price/[symbol]` currently supports `BTC-USD` only (maps to
CoinGecko's `bitcoin` id). Upstream is cached for `REVALIDATE_SECONDS`
(300s) regardless of traffic — see the route's own comments for why that's
a per-fetch Data Cache setting rather than route-segment `revalidate`
(avoids a build-time call to CoinGecko). The configured interval is checked
against the CoinGecko Demo plan's monthly call allowance by
`architecture/fitness`'s budget check, part of `check:arch`.
