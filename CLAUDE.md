# Bullpen

A paper-trading league: play money, real US stocks and crypto at live prices,
a live leaderboard. Built in public for the blog series *Architecting
Software in 2026*, one part a week.

## Architecture record

- `architecture/adr/` — decisions, with context, consequences and alternatives.
- `architecture/adl/` — structural rules the codebase must hold to.
- `architecture/calm/` — the system's shape over time (CALM pattern, moments, timeline).
- `architecture/fitness/` — the checks that enforce the ADL rules, run via `check:arch`.

Read the current part's ADRs before changing structure. Do not change a decision
already recorded in an ADR — draft a new one instead and flag it for review.

## Before committing

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:arch`.
All must pass. Run the `code-metrics-gateway` skill if available before handing
back non-trivial code.

## Guardrails

- No invented data on any deployed page — real numbers or the design system's
  empty states, never placeholders dressed as real data.
- Don't add services, folders or dependencies for a part of the series that
  hasn't started yet.
- Don't weaken a check (drop `--strict`, skip a rule) to make CI pass — fix
  the underlying issue instead.
