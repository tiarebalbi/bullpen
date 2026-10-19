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

## Result: targets met, with fewer samples than planned

Run on 2026-10-16/17 against the fixed preview deployment of `b6224a2`, 10 rounds, each after at least 20 minutes without a request.
Timings are from my laptop (time to the last byte), in milliseconds.

| Route | Cold n | Cold p50 | Cold p95 | Warm n | Warm p50 | Warm p95 | Target met |
|---|---|---|---|---|---|---|---|
| `/api/price/BTC-USD` | 9 of 10 | 1,908 (target 2,000) | 2,361 (target 3,000) | 24 of 30 | 150 (target 400) | 162 (target 900) | yes, all four |
| `/api/leaderboard` | 8 of 10 | 1,013 (target 2,000) | 2,048 (target 3,000) | 29 of 30 | 141 (target 300) | 270 (target 800) | yes, all four |

Cold samples, price: 1898, 1972, 1675, 1908, 2015, 2153, 1834, 1871, 2361. Leaderboard: 1048, 1001, 1013, 2048, 1243, 946, 1037, 990.

**The run did not collect the planned 10 cold / 30 warm samples.** Requests that failed on my side are not in the table: 7 for the price route and 3 for the
leaderboard, each a dropped or stalled connection from the laptop (`ECONNRESET`, `ETIMEDOUT`, `UND_ERR_HEADERS_TIMEOUT`). Several stalled for
8 to 16 minutes before failing, which is what a laptop going to sleep looks like, and rounds 4, 5, 7 and 9 ran late for the same reason. No request
returned an HTTP error status. A later gap only lengthens the idle time before a cold request, which is within "at least 20 minutes", but it means the
rounds were not 20 minutes apart. A cold sample that arrives as fast as a warm one is kept as it is; none did.

**An earlier attempt of the same plan stopped in round 2** on an uncaught `ECONNRESET` and kept no numbers, because the script printed only at the end. I changed
the script so a failed request is counted as a failure instead of ending the run, and it now logs every sample; the targets and the plan are unchanged.
The attempt before that one was stopped by Neon suspending the compute (see `contention.md`).

The cold figures are around 1 to 2 seconds here, so a cold request to the price route (which does not read the database) is slower than one to the leaderboard
(which does); I do not have the cause and have not tried to find one.
