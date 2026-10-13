# Deploy topology: (a) one app, Market Data as a module

Status: (a) measured. (b) Vercel Services in one project: not run yet, waiting on the project settings change.
(c) separate projects: not run, not approved.

Compute: the database is fixed at 0.25 CU on production. Nothing in this table touches the database; deploy
times do not depend on it.

Date: 2026-10-13. Hobby plan, one concurrent build. Versions: Vercel CLI 53.2.0, Node v26.11.1, pnpm 12.6.0,
Next.js 16.3.6 (webpack). Project settings when measured: bullpen-web has Framework Preset Next.js and Root
Directory `apps/web`; bullpen-landing has Next.js and `apps/landing`; both have Ignored Build Step
`npx turbo-ignore`.

## What (a) is

The market-data code lives in `apps/web/app/market-data`, the ingest is a plain route at
`/api/cron/ingest` guarded by `CRON_SECRET`, and `apps/web/vercel.json` has the daily cron
(`0 23 * * *` UTC). It is on branch `experiment/topology-a`.

What (a) cost in rules: the Trading App has to depend on the `market-data` data library, so the ADL lines that
kept it out (`Trading App HAS NO DEPENDENCY ON market-data` and the Market Data Service rules) are gone. Inside
one app the separation is a convention: nothing in the build stops a trading route from importing the
market-data module.

## Measurement

Three runs on the same branch, each a commit that touches `apps/web` so the build is not skipped, pushed
with `git push`. Per run:

```
node architecture/fitness/scripts/measure-deployments.mjs --sha <sha> --pushed-at <epoch ms> --out architecture/reports/part-03/raw/topology-a-run-N.json
```

The script reads Vercel's own timings for every deployment of bullpen-web and bullpen-landing for that
commit. Raw output: `raw/topology-a-run-1.json` to `raw/topology-a-run-3.json`.

| Metric (median of 3) | (a) one app | (b) Services, one project | (c) separate projects |
|---|---|---|---|
| Builds started | 1 | not run | not run |
| Deployments created | 2 | not run | not run |
| Time queued behind another build | 8.7 s | not run | not run |
| Push until the web deployment is ready | 70.9 s | not run | not run |
| Web build time | 55.2 s | not run | not run |

Per run:

| Run | Deployments | Builds started | Queued (web) | Web build | Push until ready |
|---|---|---|---|---|---|
| 1 | 3 | 2 | 78.1 s | 57.0 s | 147.2 s |
| 2 | 2 | 1 | 1.1 s | 38.2 s | 47.0 s |
| 3 | 2 | 1 | 8.7 s | 55.2 s | 70.9 s |

- A "deployment" counts every deployment Vercel created for the commit in either project, including the ones its
  Ignored Build Step cancelled. A "build started" counts the ones that built and became ready.
- Run 1 changed the ADL and turbo.json, which also affected bullpen-landing, so both projects built. The web
  build waited 78.1 s behind the landing build: with one concurrent build, it started at the second the landing
  build finished. Runs 2 and 3 touched only `apps/web`; landing was cancelled by its Ignored Build Step.
- One of run 1's three deployments is a web deployment cancelled 2 s after it was created, 5 s before the
  deployment that built. I have not found out why Vercel created it.

### Routes

"Every required route answers" was checked on run 1's deployment and again on run 3's. Previews sit behind
Vercel Authentication, so the checks went through a shareable link, and I did not script a check at the instant
a deployment became ready. The time from push until the routes answer is therefore reported as the time until
the deployment is ready, which is when its routes start to be served; the checks below are of correctness.

| Route | Run 3 |
|---|---|
| `/` | 200 |
| `/api/price/BTC-USD` (the landing price strip's route) | 200, live CoinGecko price |
| `/api/leaderboard` | 200, reads the production database as `trading_owner` |
| `/api/cron/ingest`, no header | 401 |
| `/api/cron/ingest`, secret and an unknown symbol | 400, no provider call spent |

### Ingest, called by hand on the preview

`GET /api/cron/ingest?symbols=AAPL` with `Authorization: Bearer <CRON_SECRET>`, at 12:18 New York time,
before the close:

```
{"date":"2026-10-13","skipped":null,"stored":[],"alreadyHad":[],"notYetPublished":["AAPL"],"failed":[],"refused":false}
```

Database side, as `market_data_owner`: one row in `market_data.provider_calls`,
`alphavantage:non-production | 2026-10-13 | calls 1 | refused 0`, and no quote. The market was open, so the
provider's latest trading day was still the day before. A second run after the close is what stores a quote.
