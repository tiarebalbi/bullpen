# ADR-0012: One database, a schema and a role per transactional owner

## Status

Proposed

## Date

2026-10-13

## Summary

One Neon project; a schema and a role per owner

## Part

3

## Context

The plan argued that code splits are cheap and data splits are the real
decision. Week one predicted a separate Prices service and a separate Market
History service, each with its own Neon database (tag `predictions-week-1`). I
have since decided that market data has one owner (ADR-0013), and this build
tests the data decisions by building them.

The Neon Free plan gives each project its own storage and compute-hours, but
each project also has its own connections and its own cold start. Three owners
of data exist or are about to: market data, trading (orders, the ledger,
accounts and positions), and later the leaderboard, which reads both.

## Decision

Each transactional owner gets its own schema and its own database role, in one database, and nothing reaches across them except one read-only view.

- **One Neon project and one database.** Inside it, a schema and a database
  role per transactional owner, not per code module: `market_data`, owned by
  `market_data_owner`, and `trading`, owned by `trading_owner`.
- **A migrator role applies migrations.** Runtime code connects only as its
  owner role. A migration folder runs as its owner, so a migration that reaches
  another schema fails in the database as well as in the check.
- **The price contract.** `market_data` publishes one read-only view,
  `market_data.prices_v1` (symbol, price, as-of timestamp, source, stale flag).
  `trading_owner` has `SELECT` on that view and `USAGE` on the schema, and no
  grant on any `market_data` table. `market_data_owner` has no access to
  `trading`.
- **Orders and the ledger stay together.** The authoritative order and ledger
  writes stay inside one transactional boundary, under the `trading` owner. A
  split needs a stated replacement for that atomicity. Separate code modules
  are fine; separate owners are not.
- **The code mirrors the ownership.** `packages/db-market-data` and
  `packages/db-trading` are separate packages with no shared query module,
  because turbo boundaries tags packages and cannot tell two subpath exports of
  one package apart.
- **The rules fail when crossed.** The ADL asserts `ONLY market-data WRITES
  market_data`, `trading READS market_data ONLY THROUGH market_data.prices_v1`
  and `ONLY trading WRITES trading.orders AND trading.ledger`. A check enforces
  them without a database; tests against a real Postgres with the real roles
  and grants prove the same thing.

## Consequences

- **The owner roles are created with SQL, not in the provider's console.** I
  checked on Neon: a role made in the console is a member of `neon_superuser`,
  granted by the platform, and through it reads and writes every schema; the
  admin role cannot revoke that. A role the admin creates with SQL is plain and
  the admin holds ADMIN on it. `db:create-roles` makes them with random
  passwords it writes to a file and never prints, and the migrations refuse to
  run if a runtime role can read every schema. No committed SQL holds a
  password.
- The leaderboard reads both schemas through the owners' contracts, not around
  them (ADR-0014).
- One project means one set of connections and one cold start for every owner,
  and one 1 GB storage allowance shared by all of them.
- A new owner is a new schema, a new role, a new package and a new ADL entry.

## Alternatives

- **A database per service, in one project** — rejected. It isolates more but
  spends connections and gives each owner its own cold start for no data the
  decision needs separated.
- **A project per service** — rejected. It gives more free storage and
  compute-hours, but more connections and independent cold starts, and it
  splits a transactional boundary I want to keep whole.
- **Shared tables with application-level discipline** — rejected. Nothing would
  fail when the discipline broke.

## Links

- ADR-0013 (one Market Data owner) and ADR-0014 (the leaderboard as a view).
- ADR-0002 (why distribute at all): data contention is one of the five reasons.
- `architecture/fitness/src/data-ownership-check.ts` and
  `architecture/fitness/src/db-integration/` — the checks and the tests.
- tag `predictions-week-1` — the week-one prediction this replaces.
