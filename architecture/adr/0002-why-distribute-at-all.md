# ADR-0002: Why distribute at all

## Status

Accepted

## Date

2026-09-25

## Summary

Every split must earn one of five reasons

## Part

1

## Context

The 2010s microservices wave was largely driven by one problem: a monolith couldn't scale its hot path independently of the rest of the system, so teams split services to scale them separately. On modern per-request serverless compute — Vercel Functions and equivalents — that problem is already solved by the platform: every function autoscales independently by default. Splitting a system into services purely to "scale the hot path" no longer buys what it used to, because the hot path already scales without a split.

That removes the most common justification for distribution, but it doesn't mean distribution is never justified — it means the remaining justifications have to be real, not cargo-culted. Bullpen's later parts do introduce genuine splits (an order saga, a Rust-based ingestion service for market data), so this series needs a stated bar those splits must clear, decided before they're built, so the justification isn't invented after the fact to rationalize a default instinct to split things up.

## Decision

Reject "split by default" and "monolith forever" alike. Start Bullpen as one deployable unit conceptually — in practice two simple Next.js apps (landing and trading app) that share packages, neither of which is a "distributed system" in the interesting sense the rest of this series will explore.

Every future split — the order saga, the Rust ingestion service, and anything else introduced in later parts — must earn its place against one of these five reasons, with a concrete check, a measurement, or a bill as evidence, not an appeal to best practice:

1. **Data contention** — independent write paths that shouldn't share a lock or a database.
2. **Failure isolation** — one component's outage shouldn't be able to take another down with it.
3. **Independent change** — a deploy cadence or ownership boundary that genuinely differs.
4. **Runtime fit** — a workload that needs a different runtime (e.g., Rust for a latency-critical ingestion path Node/TypeScript can't serve well enough).
5. **Shared budgets** — cost allocation across teams or features that a single deployable can't express.

## Consequences

- Every ADR introducing a service split in later parts of this series must cite which of the five reasons applies and back it with evidence (a load test, an incident, a profiling result, a cost report) — "it feels more scalable" or "microservices are best practice" are not acceptable justifications on their own.
- Part 1 stays intentionally simple: two Next.js apps, shared packages, no message queues, no service mesh, no separate deploy pipelines per feature. This keeps the Part 1 surface area honest about what's actually needed at this stage.
- The Rust ingestion service and the order saga, both coming in later parts, are pre-committed to needing justification under this ADR's criteria (runtime fit for Rust; likely data contention and failure isolation for the saga) — later ADRs must still make that case explicitly rather than treating it as already settled.
- This ADR becomes the standing test applied to every future architectural proposal in the series; disagreement about whether to split something reduces to disagreement about which of the five reasons applies and whether the evidence for it is real.

## Alternatives

- **Default microservices-from-day-one** — rejected. This is the classic mistake this ADR exists to argue against: splitting by default, before any of the five reasons apply, buys organizational and operational overhead (network calls, distributed failure modes, deploy coordination) without buying anything a single autoscaled deployable didn't already provide.
- **Single monolith forever** — rejected. Later parts of this series have genuine reasons to split — most clearly runtime fit for the Rust ingestion service — that this ADR's own criteria justify. Refusing to ever split would be avoiding complexity for its own sake, the same error as splitting for its own sake, just in the opposite direction.

## Links

- ADR-0001 (stack) — the serverless platform (Vercel Functions) whose autoscaling is what removed the old scaling justification.
- ADR-0003 (monorepo) — how the single deployable is structured internally ahead of any split.
- Future ADRs (later parts): the order saga service split, the Rust ingestion service split — each expected to cite this ADR's criteria explicitly.
