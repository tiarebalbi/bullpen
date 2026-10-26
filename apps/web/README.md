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

**Important:** `NEXT_PUBLIC_BULLPEN_WEB_URL` is set on the **landing** project, not
here, and a `NEXT_PUBLIC_` value is baked into the landing at build time. In
production it must be the custom domain, `https://bullpen-app.tiarebalbi.com`,
or be left unset so the landing uses that fallback: a production landing build
fails on any other value (ADR-0026), and `check:arch` holds the same rule. A
landing preview may set it to any `https://` origin. Previews of landing don't
get their own preview of `bullpen-web`, so they call production `bullpen-web`
unless the variable points elsewhere, which needs the CORS logic above to be
deployed.
