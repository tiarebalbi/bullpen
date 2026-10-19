# Roles and denials on Neon

Date: 2026-10-13. Database: the Neon production branch of the Bullpen project, database `neondb`,
Postgres 18.6. Commit of the migrations: the one that adds this file.

## What I found about console-created roles

A role created in the Neon console (Roles, New role) arrived as a member of `neon_superuser`, granted
by `cloud_admin`, with no ADMIN option for the admin role `neondb_owner`. Read with the admin role:

| Check | Result |
|---|---|
| `pg_has_role('market_data_owner', 'pg_read_all_data', 'USAGE')` | true |
| `pg_has_role('market_data_owner', 'pg_write_all_data', 'USAGE')` | true |
| `pg_has_role('market_data_owner', 'neon_superuser', 'USAGE')` | true |
| `DROP ROLE market_data_owner` as `neondb_owner` | `42501 permission denied to drop role` |

So a console-created owner role reads and writes every schema, and the admin role can neither revoke
that nor drop the role. I deleted the console role and created both with SQL as `neondb_owner`
(`pnpm --filter @bullpen/fitness-checks db:create-roles`), which makes plain roles.

## Command

```
DATABASE_URL_MIGRATOR=<unpooled neondb_owner URL> pnpm --filter @bullpen/fitness-checks db:create-roles -- --out <file>
DATABASE_URL_MIGRATOR=<unpooled neondb_owner URL> pnpm --filter @bullpen/fitness-checks db:migrate
```

Output of `db:migrate` (the URL is never printed):

```
roles.sql applied for db-market-data
roles.sql applied for db-trading
market_data: 0001_schema.sql, 0002_quotes_and_price_contract.sql, 0003_provider_calls.sql
trading: 0001_schema.sql, 0002_accounts_orders_ledger.sql, 0003_leaderboard.sql
rolname              rolsuper  rolbypassrls  neon_superuser
'market_data_owner'  false     false         false
'trading_owner'      false     false         false
SHOW max_connections: 901
```

Read again on the production branch on 2026-10-19 at 10:39 UTC, as `market_data_owner`, with `SHOW max_connections`: `901`.

## Denials, connected as each runtime role

Read-only statements, run with each role's own credentials against the pooled host:

```
trading_owner  SELECT market_data.quotes        -> 42501 permission denied for table quotes
trading_owner  SELECT market_data.prices_v1     -> OK 0 rows
market_data_owner SELECT trading.accounts       -> 42501 permission denied for schema trading
market_data_owner INSERT trading.orders         -> 42501 permission denied for schema trading
market_data_owner SELECT market_data.quotes     -> OK 0 rows
trading_owner  SELECT trading.leaderboard_mv    -> OK 0 rows
```

The same denials are tests in `architecture/fitness/src/db-integration/ownership.int.test.ts`,
which run in CI against a Postgres service container.

## Previews use the production branch

Preview deployments connect to the production Neon branch: there is no preview database. Preview branching is
off, and the preview branch the integration had made (`preview/post-03-data`) is deleted. It had no owner roles
because it was created before they existed on production; a Neon branch copies its parent's roles when it is
created, not after. `DATABASE_URL_TRADING` and `DATABASE_URL_MARKET_DATA` apply to Preview and Production with
the same values.

The production branch holds no real data yet, and the owner resets it if a test goes wrong. Test data written by
a validation run carries a marker (an account handle starting `zz-test-`, or a quote whose source is `test`),
and `pnpm --filter @bullpen/fitness-checks db:cleanup-test-data` removes it, with `--dry-run` to count first.

Because the database is shared, so is the provider call ledger. A call made outside production is counted on its
own row (`alphavantage:non-production`, cap 5) next to production's (`alphavantage`, cap 20): both are visible in
`market_data.provider_calls`, and 20 plus 5 stay inside the provider's 25 a day.

## Variable names

The runtime URLs keep one name in every environment (the same value in Preview and Production):
`DATABASE_URL_MARKET_DATA` (read only by `apps/market-data/src/db`) and `DATABASE_URL_TRADING` (read only by
`apps/web/app/lib/trading`).
