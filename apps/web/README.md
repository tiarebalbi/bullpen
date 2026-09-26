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

The route also serves apps/landing's "Live prices" strip directly
(cross-origin, browser-side fetch), so it validates the request's `Origin`
header against an allow-list and echoes back that exact origin (never a
wildcard): production's `.vercel.app` alias (`BULLPEN_LANDING_ORIGIN` env
var, defaulting to `https://bullpen-landing.vercel.app`), landing's custom
production domain (`BULLPEN_LANDING_CUSTOM_ORIGIN` env var, defaulting to
`https://bullpen.tiarebalbi.com`), plus a pattern matching landing's own
Vercel preview URLs (`bullpen-landing-<branch-or-hash>-tiare-balbis-
projects.vercel.app`). Update the relevant env var if either production
origin ever changes, or the preview pattern in `route.ts` if the Vercel
team slug changes.

**Important:** for `NEXT_PUBLIC_BULLPEN_WEB_URL` (set on the **landing**
project, not here) and any preview of `bullpen-web` itself to matter, this
CORS logic has to actually be deployed — i.e. this PR needs to merge to
`main` before a landing preview can successfully call *production*
`bullpen-web` (previews of landing don't get their own preview of
`bullpen-web`; they always call the production one).
