# Cold start of the two routes that touch the database

Targets, written before any measurement. I commit them first so the numbers cannot move the targets.

What counts as cold: the first request to a deployment after at least 20 minutes without any request to it. Vercel does not
let me force a cold start or tell me the instance was recycled, so "cold" here means "left alone for 20 minutes", and a cold
sample that comes back as fast as a warm one is kept as it is.

What counts as warm: the three requests that follow a cold one, immediately.

Each request carries a unique query string, so the CDN never answers it: every timing is a function invocation.

| Route | Runs in | Cold p50 | Cold p95 | Warm p50 | Warm p95 |
|---|---|---|---|---|---|
| `/api/price/BTC-USD` | the Market Data service | 2.0 s | 3.0 s | 0.4 s | 0.9 s |
| `/api/leaderboard` | the trading app (reads Neon) | 2.0 s | 3.0 s | 0.3 s | 0.8 s |

These are timings from my laptop over the internet (time to the last byte), so they include a round trip a user in the same
region would not pay. The cold target is a missed target if the p95 of 10 cold samples is above it. A miss stops the work:
I report it, I do not warm the routes to hide it.

Plan: 10 cold samples per route, 20 minutes apart (30 warm samples per route), against one fixed preview deployment of this
branch, not the branch alias, so a later push cannot swap the deployment under the run.
