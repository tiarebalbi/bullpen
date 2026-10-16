# The post's claims, checked against the running preview

Date: 2026-10-16. Preview: the deployment of commit `35a2eff` of `post-03-data` (a fixed deployment of `bullpen-web`, reached
through a time-limited share link; the token is not recorded). Database: the Neon production branch the preview shares.

| # | Claim in the post | Result | Evidence |
|---|---|---|---|
| 1 | One database with schemas `market_data` and `trading` | pass | database `neondb`, PostgreSQL 18.6; `information_schema.schemata` lists both (output below) |
| 2 | `trading_owner` can read only `prices_v1` in `market_data` | pass | `SELECT market_data.quotes`, `INSERT market_data.quotes` and `SELECT market_data.provider_calls` all `42501 permission denied`; `SELECT market_data.prices_v1` returns rows. Neither role is superuser, bypassrls or a member of `pg_read_all_data` |
| 3 | Market Data runs as a Vercel Service | pass | `vercel.json` declares the `market-data` service with its own entrypoint, and routes `/api/price/*` and `/api/cron/*` to it. On the preview `/api/price/BTC-USD` answered 200 with `Vary: Origin` (a header only the service's code sets), and `/api/cron/ingest` answered 200 with its JSON report |
| 4 | Buying power is reserved by one conditional UPDATE in the order transaction | pass | `packages/db-trading/src/buy.ts`: `UPDATE trading.accounts ... WHERE account_id = $1 AND buying_power >= cost ... RETURNING`, inside the same transaction as the order and ledger inserts. The concurrent-overspend and rollback tests are in `evidence-db-suite.md` |
| 5 | The leaderboard is a materialized view, refreshed `CONCURRENTLY`, no reader waits, a non-blocking advisory lock, a failed refresh keeps the last good ranking | pass | `trading.leaderboard_mv` exists with the unique index `CONCURRENTLY` needs (below); `refreshLeaderboard` takes `pg_try_advisory_xact_lock` and skips if held; four tests in `leaderboard.int.test.ts` cover a fresh read, a stale read, two readers and a failed refresh; `contention.md` measures the readers |
| 6 | The daily cron is `0 23 * * *` UTC | pass on configuration, not yet observed | `vercel.json` `crons`. Vercel runs crons only on production, so the first run is the day after the merge: it is on the merge-day checklist |
| 7 | Stock cap is 20 a provider-day, preview cap 5 | pass | production reserves on `alphavantage` (cap 20) and everything else on `alphavantage:non-production` (cap 5): `budget.test.ts`. A preview ingest today reserved 2 calls on `alphavantage:non-production`; 60 concurrent callers against a cap of 20 grant exactly 20 (`evidence-db-suite.md`) |
| 8 | A status-aware drift check | pass | `drift-check.md`: fails with ADR-0008 Proposed, holds when Accepted |

## Live database output

Run as each runtime role over its own URL (the URLs are not printed):

```
current_user: {
  current_user: 'trading_owner',
  current_database: 'neondb',
  version: 'PostgreSQL 18.6 (653b019) on aarch64-unknown-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit'
}
trading_owner  schemas visible -> OK 2 row(s) [{"schema_name":"market_data"},{"schema_name":"trading"}]
trading_owner  SELECT market_data.quotes -> 42501 permission denied for table quotes
trading_owner  SELECT market_data.prices_v1 -> OK 2 row(s) [{"symbol":"ZZTA","price":"10.00000000","stale":false},{"symbol":"ZZTB","price":"10.00000000","stale":false}]
trading_owner  INSERT market_data.quotes -> 42501 permission denied for table quotes
trading_owner  SELECT market_data.provider_calls -> 42501 permission denied for table provider_calls
market_data_owner SELECT trading.accounts -> 42501 permission denied for schema trading
market_data_owner INSERT trading.orders -> 42501 permission denied for schema trading
matview + unique index (needed for CONCURRENTLY) -> OK 1 row(s) [{"matviewname":"leaderboard_mv","indexname":"leaderboard_mv_account_id_idx","indexdef":"CREATE UNIQUE INDEX leaderboard_mv_account_id_idx ON trading.leaderboard_mv USING btree (account_id)"}]
roles -> OK 2 row(s) [{"rolname":"market_data_owner","rolsuper":false,"rolbypassrls":false,"reads_all":false},{"rolname":"trading_owner","rolsuper":false,"rolbypassrls":false,"reads_all":false}]
```

## What the preview shows that the post should not claim

- `GET /api/stock-prices` returns no rows: no stock price has been ingested for a closed trading day yet. The ingest I called
  on the preview at 12:37 UTC asked for today's date, and the provider had not published it (`notYetPublished: ["AAPL","MSFT"]`),
  as designed. The after-close run is recorded in `deploy-topology.md`.
- `GET /api/leaderboard` returns no rows while the test accounts are not in the view; it is stale by design until the next
  refresh.
