# Evidence from the database integration suite

Date: 2026-10-16. Run locally against a throwaway `postgres:17-alpine` container (the same job CI runs against a
service container). Roles are created by `db-create-roles` as plain SQL roles, the migrations run as each owner.
Nothing here touches Neon; the denials on the Neon production branch are in `neon-roles.md`, with `SHOW max_connections: 901`.

## Command

```
pnpm --filter @bullpen/fitness-checks test:db -- --reporter=verbose
```

## What each group proves

| Claim | Test names (below) |
|---|---|
| `trading_owner` is denied market_data tables and may read `prices_v1` | `ownership.int.test.ts`, first three |
| A buy is one transaction; a failure after the order insert rolls everything back | `trading.int.test.ts`, "a buy is one transaction" |
| Concurrent overspend: of two buys that each fit, exactly one commits, and the loser leaves no order, ledger entry or reservation | "lets exactly one of two concurrent buys commit..." |
| 12 concurrent buyers of 300 against 1000: exactly 3 commit, 100 left | "holds under many concurrent buyers" |
| Stock cap: 60 callers against a cap of 20 grant exactly 20, 40 refused, none counted as a call | `budget.int.test.ts`, first test |
| The reconciliation check fails for a fill after the last refresh and for a tampered row, naming account and both values | `leaderboard.int.test.ts`, below |

## Output, verbatim

```
 RUN  v5.0.2 <repo>/architecture/fitness
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > denies trading_owner a SELECT from a market_data table 20ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > lets trading_owner SELECT from market_data.prices_v1, with the stale flag 33ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > denies trading_owner any write through the price contract 9ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > denies market_data_owner every read and write on trading 7ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > does not let PUBLIC use either schema: a role with no grant sees neither 67ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > runs each migration folder as its own owner, so a migration that reaches the other schema fails in the database 46ms
 ✓ src/db-integration/ownership.int.test.ts > market_data is owned by market_data_owner, trading by trading_owner > owns every object in the schema by that schema's owner role 33ms
 ✓ src/db-integration/ownership.int.test.ts > the roles hold only what they should > created both runtime roles as plain roles: no superuser, no bypassrls, no membership of a role that reads every schema 83ms
 ✓ src/db-integration/ownership.int.test.ts > the roles hold only what they should > refuses to create over an existing role that can read every schema, such as one made in a console 96ms
 ✓ src/db-integration/ownership.int.test.ts > the roles hold only what they should > refuses to migrate if a runtime role can read every schema 131ms
 ✓ src/db-integration/ownership.int.test.ts > the roles hold only what they should > is idempotent: applying the migrations again changes nothing and fails nothing 163ms
 ✓ src/db-integration/trading.int.test.ts > a buy is one transaction > writes the order and its ledger entries together, updates the position and the buying power, and commits 239ms
 ✓ src/db-integration/trading.int.test.ts > a buy is one transaction > rolls back every write when a failure is injected after the order insert: no order, no ledger entry, no reservation 13ms
 ✓ src/db-integration/trading.int.test.ts > a buy is one transaction > leaves a connection that can be used again after a rollback 11ms
 ✓ src/db-integration/trading.int.test.ts > buying power is reserved by one conditional update > lets exactly one of two concurrent buys commit when each fits but together they overspend 114ms
 ✓ src/db-integration/trading.int.test.ts > buying power is reserved by one conditional update > holds under many concurrent buyers: the account never goes below zero and every committed order is paid for 310ms
 ✓ src/db-integration/trading.int.test.ts > buying power is reserved by one conditional update > keeps CHECK (buying_power >= 0) as a second guard 11ms
 ✓ src/db-integration/trading.int.test.ts > buying power is reserved by one conditional update > refuses a buy the account cannot pay for, with a clear message and no writes 24ms
 ✓ src/db-integration/trading.int.test.ts > buying power is reserved by one conditional update > refuses an account that does not exist 4ms
 ✓ src/db-integration/trading.int.test.ts > a buy fills only at a current price > refuses a buy at a stale price, naming the symbol and the time, and writes nothing 6ms
 ✓ src/db-integration/trading.int.test.ts > a buy fills only at a current price > refuses a symbol that has no price yet 5ms
 ✓ src/db-integration/trading.int.test.ts > the trading owner still cannot read market_data tables while buying > fills through prices_v1 only: the buy's role has no grant on the quotes table 65ms
 ✓ src/db-integration/budget.int.test.ts > the call ledger > holds the cap under concurrent callers: 60 callers, a cap of 20, exactly 20 granted and no double spend 373ms
 ✓ src/db-integration/budget.int.test.ts > the call ledger > counts a refused call as a refusal and never as a call 6ms
 ✓ src/db-integration/budget.int.test.ts > the call ledger > rolls the day over: a new provider-day starts again from zero while the old one stays full 18ms
 ✓ src/db-integration/budget.int.test.ts > the call ledger > keeps providers apart 2ms
 ✓ src/db-integration/budget.int.test.ts > the call ledger > grants nothing under a cap below one 0ms
 ✓ src/db-integration/leaderboard.int.test.ts > reading the leaderboard: no reader waits for a refresh > a fresh read returns the ranking with its as-of time and starts no refresh 210ms
 ✓ src/db-integration/leaderboard.int.test.ts > reading the leaderboard: no reader waits for a refresh > a stale read returns the current ranking at once, then starts one refresh after the response 101ms
 ✓ src/db-integration/leaderboard.int.test.ts > reading the leaderboard: no reader waits for a refresh > two readers that detect staleness at once start two refreshes of which exactly one runs 293ms
stdout | src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > fails for a fill after the last refresh and before the next, naming the account and both values
reconciliation, fill after the last refresh:
✗ leaderboard reconciliation: the leaderboard view equals the ranking computed on read from the source tables
  where:   trading.leaderboard_mv
  why:     Account "player-aa2f39fc-b964-4e71-aa51-099f8bf79f29" (dc64149f-54bb-4174-89da-992873ce45b3) is rank 1, equity 1000.00000000 (cash 1000.00000000, positions 0.00000000) in the view, but rank 1, equity 1000.00000000 (cash 600.00000000, positions 400.00000000) computed from the source tables (ADR-0014).
  fix:     Refresh the view after the last fill or price, or correct the view's definition so it matches the on-read query.
 ✓ src/db-integration/leaderboard.int.test.ts > reading the leaderboard: no reader waits for a refresh > a failed refresh leaves the last good ranking and its age, and records the failure 42ms
 ✓ src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > passes for a fresh view after a fill and a refresh 54ms
 ✓ src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > fails for a fill after the last refresh and before the next, naming the account and both values 40ms
stdout | src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > fails for a tampered view row, naming the account and both values
reconciliation, tampered view row:
✗ leaderboard reconciliation: the leaderboard view equals the ranking computed on read from the source tables
  where:   trading.leaderboard_tampered
  why:     Account "player-68d2c44f-0919-4626-9263-a70394a9b035" (e7c12c1b-a317-4acb-b1da-f05dcf9a36f0) is rank 1, equity 9999.00000000 (cash 9999.00000000, positions 0.00000000) in the view, but rank 1, equity 1000.00000000 (cash 1000.00000000, positions 0.00000000) computed from the source tables (ADR-0014).
  fix:     Refresh the view after the last fill or price, or correct the view's definition so it matches the on-read query.
 ✓ src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > fails for a tampered view row, naming the account and both values 25ms
 ✓ src/db-integration/leaderboard.int.test.ts > the reconciliation check: the view equals the ranking computed on read > fails when a price moves after the last refresh 46ms
 ✓ src/db-integration/prices.int.test.ts > readPrices: the trading owner reads prices through the contract > returns the latest price of a symbol with its as-of time and stale flag 168ms
 Test Files  5 passed (5)
      Tests  36 passed (36)
   Start at  05:35:25
   Duration  4.68s (tests 94%, import 4%, transform 2%)
```
