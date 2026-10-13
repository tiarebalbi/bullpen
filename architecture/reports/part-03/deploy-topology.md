# Deploy topology: (a) one app, Market Data as a module

Status: (a) and (b) measured. (c) separate projects: not run, not approved.

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
| Builds started | 1 | 1 | not run |
| Deployments created | 2 | 2 | not run |
| Time queued behind another build | 8.7 s | 4.0 s | not run |
| Push until the web deployment is ready | 70.9 s | 42.7 s | not run |
| Web build time | 55.2 s | 31.6 s | not run |

Read this table with the caveat below: the runs changed different things, so the build times are not a like-for-like
comparison of the two topologies.

Per run:

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

Per run, (a):

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

## (b) Vercel Services in one project

Branch `post-03-data`. The root `vercel.json` defines two services, `web` (Next.js, `apps/web/`) and `market-data`
(`apps/market-data/`, runtime `node`, entrypoint `server.ts`, which is a small router), with top-level rewrites
for `/api/price/*` and `/api/cron/*` to the service and everything else to `web`. Project settings during the test:
Framework Preset Services, Root Directory empty, Ignored Build Step empty (Skip Deployments), Build, Install and
Output empty. The values before were Next.js, `apps/web`, `npx turbo-ignore`.

Three runs, same method as (a), each a commit touching `apps/market-data`:
`raw/topology-b-run-1.json` to `raw/topology-b-run-3.json`.

| Run | Deployments | Builds started | Queued (web) | Web deployment build | Push until ready |
|---|---|---|---|---|---|
| 1 | 2 | 1 | 4.0 s | 27.6 s | 39.6 s |
| 2 | 2 | 1 | 14.4 s | 31.6 s | 52.9 s |
| 3 | 2 | 1 | 2.6 s | 32.2 s | 42.7 s |

One deployment holds both services: the build log shows the `web` service built first and the `market-data`
service second, inside the same deployment.

Caveat on the comparison. In (b) runs 2 and 3 only the market-data service changed, so the web service's build was
a Turborepo remote-cache hit (the log says `FULL TURBO`). In (a) the same kind of change (a touch to the
market-data code) sat inside the Next.js app and rebuilt it. Part of (b)'s faster build is therefore the topology
(an unchanged service is not rebuilt) and part is cache luck, and the measurement does not separate them.

### What it took to get (b) running, in order

1. The first push built with the old settings: the build log ran `npx turbo-ignore` and built only the web app,
   so `/api/price/*` answered the web app's own 404. The Services settings were not in effect yet.
2. With the settings applied (the project reads `framework: services`), the services config was read and both
   services were built, but the `market-data` service failed with `STATIC_BUILD_NO_OUT_DIR`: it had no framework
   and a `build` script, so Vercel looked for a static `public` folder.
3. After removing the service's `build` script and declaring `runtime: node` and an `entrypoint`, the deployment
   was ready. No `buildCommand` or `outputDirectory` workaround.

Dashboard steps (b) needs: Framework Preset Services, Root Directory emptied, Ignored Build Step emptied. They are
project settings, not code: a deployment of this branch built with the old settings has no `/api/price`.

### Skip Deployments

On every push that changed only one project's code, the other project still got a deployment, which sat in the
queue and was then cancelled. bullpen-landing, unaffected by a web-only push, was created and cancelled after
queueing between 0.9 s and 40.9 s on every run in (a) and (b). That is measured. A landing-only push, which would
start a web deployment that is then cancelled, was not tested.

### Routes on run 1's deployment (preview, reached through a shareable link)

| Route | Result |
|---|---|
| `/` | 200 |
| `/api/price/BTC-USD` | 200, served by the Market Data service, live CoinGecko price |
| `/api/price/DOGE-USD` | 404 `{"error":"Unknown symbol."}` |
| `/api/leaderboard` | 200, the web service |
| `/api/cron/ingest`, no header, wrong secret, the old guessable secret | 401 |
| `/api/cron/ingest`, current secret, an unknown symbol | 400, no provider call |
| `/api/cron/ingest`, current secret, POST | 405 |
| `/api/cron/other` | 404 `{"error":"Not found."}` from the service |
| `/api/ingest`, `/api/price`, `/server.ts` | 404 from the web app: not routed to the service |

The service is reached only through its two rewrites: a path outside them lands on the web app, and `server.ts`
is not served as a file. The service has no URL of its own.

### CORS through the CDN

The price route echoes an allowed landing origin in `Access-Control-Allow-Origin` and sets `Vary: Origin`. On a
fresh URL, a request with the landing's origin gets the header, as do landing preview origins and the error
response. But Vercel's CDN does not vary its cache on `Origin`: a response cached for a request without an
`Origin` header (a same-origin request from the trading app, or `curl`) was served unchanged to a later request
with the landing's origin, without the header, for the cache lifetime of 300 s. The trading app's own ticker
sends no `Origin`, so the landing's price strip can be served a response without the header. The route's design
(`s-maxage` with `Vary: Origin`) is unchanged from before the move to the service, so this is likely a problem
that existed already; I did not check production.

## Not run

(c) separate Vercel projects: not approved.
