# What Part 3 cost this week (2026-w42, read on 2026-10-16)

The week closes on 2026-10-18, and `cost/usage/2026-w42.json` stays `pending` until I copy the numbers from the dashboards
afterwards. This table holds what I could read myself today, from the database and from the plans. A cell that says
"dashboard" is a number I could not read from here, and I have not estimated it.

| Resource | Used | Allowance | Where I read it |
|---|---|---|---|
| Alpha Vantage calls, peak day, production | 0 | 25 a day (cap 20) | `market_data.provider_calls`: no `alphavantage` row exists |
| Alpha Vantage calls, peak day, previews | 2 (2026-10-16) | cap 5 | `market_data.provider_calls`, `alphavantage:non-production` (1 more on 2026-10-13) |
| CoinGecko calls, October to date | 14, all from previews | 10,000 a month | `market_data.provider_calls`, `coingecko:non-production` |
| Neon storage | 12 MB | 1 GB per project | `pg_database_size` on the production branch |
| Neon compute | dashboard | 100 CU-hours a month | fixed at 0.25 CU; the contention run kept it busy for about 4 minutes of 30-second cells |
| Vercel function invocations, edge requests, active CPU, deployments | dashboard | see `cost/allowances.json` | Hobby usage page |
| Vercel Services requests | dashboard | 1,000,000 a month | Hobby usage page |

Rows in the database at the time: 2,000 test accounts and 5,338 ledger rows, all from the contention run; removed by
`db:cleanup-test-data` at the end (counts in the final report). 10 quotes are on file.

**Total in USD: 0.00 on every plan.** Vercel Hobby, Neon Free, CoinGecko Demo and Alpha Vantage free are all free plans, and
nothing in this week is on a paid tier. That is the plan price, not an invoice: the Vercel billing endpoint answers
"Plan not found" for a Hobby team, and Neon and the two providers show no charges I can read from here. I will confirm it from
the dashboards after 2026-10-18 before I fill in the usage file.
