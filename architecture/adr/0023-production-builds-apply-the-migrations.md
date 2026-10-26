# ADR-0023: A production build applies the migrations before it deploys

## Status

Accepted

## Date

2026-10-22

## Summary

A production build applies the migrations or fails

## Part

4

## Context

Migrations were a manual step: `db:migrate` run by hand with the admin URL (ADR-0012). Twice in one day production ran code whose migration had not been
applied. Migration 0006 (`trading.accounts.owner_user_id`) was missing, so every signed-in request answered 503 "I cannot reach the account", and the
function log was empty because the error was swallowed. After that was fixed, a second database was found without 0004 (`reservations`, `fills`,
`order_events`). Nothing in CI or in the deploy ran migrations: the CI database job uses a throwaway Postgres and never sees production. The cause both
times was the same: a deploy and its migration were two steps, and one was easy to forget.

## Decision

A production build of the trading app applies every migration, as the migrator role, before `next build`, and a production build that cannot do so fails.

- **Where.** `apps/web`'s `vercel-build` script runs `db:migrate` and then `next build`. Vercel runs the build before it promotes a deployment, so the new
  code is never live against an older schema. Every migration so far only adds, and every file is idempotent, so the old code keeps working while the
  migration runs.
- **Which builds.** Only `VERCEL_ENV=production`. A preview build skips the step and says so: a preview must not change a database, and its address and
  data are not production's. A build with no `VERCEL_ENV` (a developer's machine, CI) keeps today's behaviour: it migrates only when asked, by running
  `db:migrate` with `DATABASE_URL_MIGRATOR`.
- **Failure is loud.** A production build with no `DATABASE_URL_MIGRATOR`, or whose migration throws, fails the build. The previous deployment stays live.
  The migrator's URL is never printed.
- **The secret.** `DATABASE_URL_MIGRATOR` is the unpooled admin URL (ADR-0012). It is set in Vercel for the Production environment only, and it is read only
  by the migration script, never by the app at runtime. It is not added to GitHub secrets.
- **The decision of what to do is a function with tests** (`architecture/fitness/src/migration-plan.ts`), so the three cases above are checked, not read.
- `GET /api/health` already reports a missing table or column by name, so a database that is still behind shows up there.

## Consequences

- A merge to `main` is enough: the migration and the code that needs it go out together.
- The admin credential now exists in Vercel's Production environment, where a build can read it. A build runs the repository's code, so anyone who can
  change a production build step can reach the admin URL. That is the cost of automating this, and the reason it is scoped to Production.
- A migration that fails halts the deploy instead of shipping code against a schema that is behind. A migration that is not additive, one that drops or
  renames, needs the old code to survive it; this ADR does not cover that, and such a migration needs its own plan.
- If Vercel does not run `vercel-build` for the service, the step does nothing and the health check is what notices. The first production build's log
  must show "trading:" with the migrations listed.
- Rolling back a deployment does not roll back the schema.

## Alternatives

- **A GitHub Actions job on merge to `main`.** It would run in parallel with Vercel's deploy, not before it, so the code could go live first. It would also
  put the admin URL in GitHub secrets, a second place it lives.
- **Migrate when the app starts, or on the first request.** Runtime code connects only as its owner role (ADR-0012), and every cold start would race.
- **Keep it manual, with a checklist.** What failed twice.
- **A post-deploy check that fails on `/api/health` and nothing else.** It notices the gap after the code is live; this one prevents it.

## Links

- ADR-0012 (data ownership, schema and role per owner): the migrator role, and "runtime code connects only as its owner role".
