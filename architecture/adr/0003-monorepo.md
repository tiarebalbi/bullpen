# ADR-0003: Monorepo

## Status

Accepted

## Date

2026-09-25

## Summary

One Turborepo monorepo, my call

## Context

Bullpen already spans multiple deployables (a landing app and a trading app) and shared code (a data model, UI, config) that both depend on. Later parts of the series add more moving pieces — the order saga, the Rust ingestion service — that will need to evolve alongside shared contracts without every change becoming a multi-repo coordination exercise. The build/test tooling also needs to scale with the codebase: as more apps and packages are added, CI shouldn't have to rebuild and retest everything on every change.

Decided by Tiare Balbi Bonamini for this project.

## Decision

One Turborepo monorepo, organized as `apps/` (the deployables) and `packages/` (shared libraries, starting with `packages/contracts` for the shared data model), managed with pnpm workspaces. This gets affected-only builds and tests via Turborepo's task graph, local and remote caching, and enforced dependency boundaries between apps and libraries via `turbo boundaries`.

## Consequences

**Gains:**
- Atomic cross-service changes land in one PR — a change to a shared contract and both apps that consume it is one reviewable, one mergeable unit, not a coordinated multi-repo release.
- One shared data model (`packages/contracts`) is the single source of truth both apps build against, instead of duplicated or drifting type definitions per repo.
- Shared tooling and config (TypeScript config, ESLint config, test setup) is defined once and consumed everywhere, instead of copy-pasted and re-drifted per repo.

**Costs:**
- A shared CI blast radius: a broken package can block builds or tests for every app that depends on it, even ones whose own code didn't change.
- An easy path toward accidental coupling — nothing stops an app from reaching into another app's internals, or two apps from silently sharing more than they should, unless something enforces the boundary.

That second cost is exactly why the ADL structural rules and `turbo boundaries` checks (see `architecture/adl/`) exist: they make the apps/packages boundary a checked constraint in CI, not a convention people are trusted to remember.

## Alternatives

- **Polyrepo** — rejected for now. At this stage (two simple apps, one team, one contributor) the cross-repo ceremony (versioning shared packages, coordinating multi-repo releases, syncing tooling config across repos) costs more than it returns. Revisit if and when teams multiply and independent-repo ownership becomes a real requirement rather than a hypothetical one.

## Links

- ADR-0001 (stack) — Turborepo and pnpm versions pinned.
- ADR-0002 (why distribute at all) — the monorepo holds multiple deployables without yet being a distributed system in the interesting sense; this ADR is about repo structure, not service topology.
- `architecture/adl/` — the structural rules and `turbo boundaries` checks that enforce the apps/packages dependency boundary this ADR relies on.
