# ADR-0001: Stack

## Status

Accepted

## Date

2026-09-25

## Context

Bullpen is a public prototype and blog demo — a paper-trading league where players compete with play money on real US stock and crypto prices, with a live leaderboard. It is not a commercial product: there is no billing, no SLA, and no expectation of production traffic beyond what a blog audience generates.

Vercel's Hobby plan is explicitly licensed for non-commercial personal projects, which matches this use case exactly. It gives free per-request serverless compute, preview deployments per PR, and a straightforward path to add free-tier managed integrations as the series progresses (Neon for Postgres, Upstash for Redis, Grafana Cloud for observability — all arriving in later parts of the series, not Part 1).

The repo needs to support multiple deployables (a landing site and a trading app in this part, more later) without turning every change into a cross-repo coordination problem, and needs tooling that only rebuilds/retests what actually changed as the codebase grows.

## Decision

Use Vercel's Hobby plan as the deployment target, a Turborepo monorepo managed with pnpm workspaces, and TypeScript as the implementation language across apps and packages. Free-tier managed services (Neon, Upstash, Grafana Cloud) are planned integrations for later parts of the series and are not wired up in Part 1.

Every tool version below is pinned exactly and must not drift without a follow-up ADR or explicit changelog note:

| Tool | Version |
|---|---|
| Node.js | 22.23.3 (LTS "Jod") |
| pnpm | 12.6.0 |
| Turborepo | 2.11.4 |
| turbo-ignore | 2.11.4 |
| TypeScript | 6.0.3 |
| Next.js | 16.3.6 |
| React | 19.3.0 |
| Vitest | 5.0.2 |
| @testing-library/react | 16.3.3 |
| @testing-library/jest-dom | 7.0.1 |
| Playwright (@playwright/test) | 1.63.0 |
| ajv | 8.20.0 |
| eslint | 10.11.0 |
| eslint-config-next | 16.3.6 |
| @finos/calm-cli | 1.60.1 (CALM schema release 1.2 — `https://calm.finos.org/release/1.2/meta/calm.json`, `https://calm.finos.org/release/1.2/meta/timeline.json`) |

TypeScript is pinned at 6.0.3, not the newer 7.x line: `typescript-eslint` 8.70.1 (the current linting toolchain) refuses to run at all under TypeScript 7.0, since the ecosystem hasn't caught up to the new native/Go-based compiler yet (tracked at `typescript-eslint#10940`). Discovered by actually running the lint task, not assumed — revisit once `typescript-eslint` supports 7.x.

## Consequences

- Deployments, previews, and edge/serverless functions are free as long as usage stays within Hobby plan limits and non-commercial terms; if Bullpen ever needs a commercial license (custom domain monetization, team seats, higher limits), a plan upgrade or migration ADR is required before that happens.
- Turborepo's affected-only task graph and pnpm's workspace linking keep CI fast as more apps/packages are added, but only if package boundaries are kept clean (see ADR-0003).
- Pinning every version exactly means upgrades are deliberate: a version bump is a reviewed change, not something that happens silently via `^`/`~` ranges or `latest` tags.
- CALM (`@finos/calm-cli`) is adopted now for architecture-as-code validation against schema release 1.2, ahead of any distributed topology existing — it validates the current one-node architecture and will validate the split topology introduced in later parts.
- The free-tier integrations (Neon, Upstash, Grafana Cloud) are named here as the plan, but adding them is deferred to the parts of the series where they're actually needed, keeping Part 1 dependency-free beyond Vercel itself.

## Alternatives

- **Cloudflare Workers** — good edge compute story, but a weaker fit for a Next.js-first stack and for the free Postgres/Redis integrations (Neon, Upstash) the series wants to lean on; rejected for this stack.
- **AWS only** — full infrastructure control, but far more setup and operational cost than a Part 1 prototype warrants; the plan is to bring AWS Lambda in later specifically for the Rust ingestion service, not to run the whole stack on AWS.
- **Fly.io** — a good fit for long-running processes, but Part 1 is pure per-request serverless with no long-running workload yet, so there's no need for that capability now.

## Links

- ADR-0002 (why distribute at all) — the criteria that will govern when a second runtime/platform, like AWS Lambda for Rust ingestion, gets introduced.
- ADR-0003 (monorepo) — how apps and packages are organized within this stack.
- Vercel Hobby plan terms: https://vercel.com/docs/plans/hobby
- FINOS CALM schema release 1.2: https://calm.finos.org/release/1.2/meta/calm.json, https://calm.finos.org/release/1.2/meta/timeline.json
