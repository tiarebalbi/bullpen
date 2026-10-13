# ADR-0004: Deploy topology: Vercel Services in one project

## Status

Proposed

## Date

2026-10-13

## Summary

Market Data is a Service in one project, shared release

## Part

3

## Context

Market Data became one owner (ADR-0013) and needs a place to run. The Hobby plan allows one concurrent build and 100
deployments a day, so the shape of the deploy matters as much as the code. I compared two ways to run it on the same
code, and left a third untried:

- **One app**, Market Data as a module inside the trading app. Measured on a branch.
- **Vercel Services in one project**, Market Data as a service beside the trading app, behind rewrites. Measured on
  `post-03-data`.
- **Separate Vercel projects.** Not measured: it needs a project I did not create.

The numbers, with their caveat, are in `architecture/reports/part-03/deploy-topology.md`. Medians of three runs: the
one-app version was ready 70.9 s after the push and the Services version 42.7 s, but the Services runs reused a cached
web build that the one-app runs rebuilt, so the gap is not all topology.

The one-app version also showed a cost the numbers do not: the Trading App then depends on the market-data data
library, so the rule that keeps it out (`Trading App HAS NO DEPENDENCY ON market-data`) has to go. Inside one app the
separation is a convention that nothing in the build enforces.

## Decision

Run Market Data as a Vercel Service in the same project as the trading app, defined by a `vercel.json` at the
repository root: a `web` service (Next.js) and a `market-data` service (Node, one entrypoint that routes `/api/price/*`
and `/api/cron/ingest`), with top-level rewrites so the public URLs do not change.

- **The release is shared, on purpose.** Both services deploy together and roll back together. That is a deliberate
  coupling: Market Data is a boundary, not an independently deployed microservice.
- **The boundary is real in the build.** The service is its own package, so the ADL can say the Trading App has no
  dependency on it, and turbo boundaries fails the build if it grows one.
- **The project settings are part of the decision.** Framework Preset Services, an empty Root Directory and
  Skip Deployments. A build of the branch with the old settings has no price route.

## Consequences

- A shared release is a coupling. A change to either service redeploys the project, and a bad release of either rolls
  back both.
- Services is in beta, and the documentation did not cover three things I had to find by trying: where `crons` goes
  (a top-level `crons` is accepted), what a plain Node service needs (`runtime`, an `entrypoint` and no build script),
  and what happens to a project that has a Root Directory (it has to be empty for the root `vercel.json` to be read).
- Settings and code must change together on the day this merges.
- A project whose unaffected half still gets a deployment that is queued and then cancelled: one concurrent build means
  the cancelled one can still delay the real one.
- One cache caveat found on the way: Vercel's CDN does not vary on `Origin`, so a price response must say
  `Vary: Origin` itself.

## Alternatives

- **One app, Market Data as a module** — rejected. It removes the one dependency rule that keeps trading code away from
  market-data code, and the build can no longer fail when it is crossed.
- **Separate Vercel projects** — not tried. It would give independent releases at the cost of cross-origin calls and a
  second project to manage; the evidence for it would be a reason to need independent releases, which Part 3 does not
  have.

## What would reverse it

- A second consumer of Market Data that needs it released on its own: then separate projects, and a stated contract
  between them.
- Build queueing on Hobby becoming the slowest step of a deploy, which would argue for fewer deployments, not more.
- Services leaving beta in a form that makes the shared release optional.

## Links

- ADR-0002 (why distribute at all): independent change is one of the five reasons, and this is the evidence that it is
  not met yet.
- ADR-0012 (data ownership), ADR-0013 (one Market Data owner).
- `architecture/reports/part-03/deploy-topology.md` — the measurements, the caveat and what getting (b) running took.
