# What Part 3 used this week (2026-w42), as of 2026-10-16

The week closes on 2026-10-18, and `cost/usage/2026-w42.json` stays `pending` until I copy the numbers from the dashboards
afterwards. This table holds what I could read myself today, from the database and from the plans. A cell that says
"pending" is a number I could not read from here, and I have not estimated it: it needs the provider dashboards after the week closes.

| Resource | Used | Allowance | Where I read it |
|---|---|---|---|
| Alpha Vantage calls, peak day, production | 0 | 25 a day (cap 20) | `market_data.provider_calls`: no `alphavantage` row exists |
| Alpha Vantage calls, peak day, previews | 2 (2026-10-16) | cap 5 | `market_data.provider_calls`, `alphavantage:non-production` (1 more on 2026-10-13) |
| CoinGecko calls, October to date | 14, all from previews | 10,000 a month | `market_data.provider_calls`, `coingecko:non-production` |
| Neon storage | 12 MB | 1 GB per project | `pg_database_size` on the production branch |
| Neon compute | pending (dashboard, after 2026-10-18) | 100 CU-hours a month | compute is fixed at 0.25 CU; I can only say it did not scale |
| Vercel function invocations, edge requests, active CPU, deployments | pending (Hobby usage page, after 2026-10-18) | see `cost/allowances.json` | not readable from here |
| Vercel Services requests | pending (Hobby usage page, after 2026-10-18) | 1,000,000 a month | not readable from here |

Rows in the database at the time: 2,000 test accounts and 5,338 ledger rows, all from the contention run; removed by
`db:cleanup-test-data` at the end (counts in the final report). 10 quotes are on file.

**Total in USD: pending, and no longer zero for Neon.** On 2026-10-16 the project moved from Neon's Free plan to the Launch plan, because the Free
plan's 5 GB of network transfer was used up by the 2,000-account contention run. Launch includes 500 GB of transfer a month, then
$0.10 a GB, and bills compute at $0.106 per CU-hour and storage at $0.35 per GB-month (`cost/allowances.json`, source neon.com/pricing).
The rest (Vercel Hobby, CoinGecko Demo, Alpha Vantage free) is still free. I have not seen a Neon charge: the actual amount is pending
until the console shows it, and I will not put a number here before it does. The Vercel billing endpoint answers "Plan not found" for a
Hobby team, so the Vercel line is a plan price, not an invoice.
