# Bullpen

A paper-trading league: play money, real US stocks and crypto at live prices,
a live leaderboard. Built in public for the blog series *Architecting
Software in 2026*, one part a week.

## Where each record lives

- `architecture/adr/` — decisions, with context, consequences and alternatives.
- `architecture/adl/structure.adl` — the structural rules the codebase must hold to.
- `architecture/calm/` — the system's shape over time. `architecture/calm/moments/` is what
  was built; `architecture/calm/planned/` is each part's prediction (never edit it: Part 6
  compares it with reality); `architecture/calm/bullpen.timeline.json` links each moment to
  its ADRs.
- `architecture/fitness/` — the checks that enforce the ADL, run via `check:arch`.
- `architecture/reports/part-0N/` — the rules snapshot for each part.
- `content/architecture/part-0N.json` — what the explorer draws; it must match its CALM document.
- `docs/data-sources.md` — every market-data provider's terms, and what was decided.
- `cost/` — free-tier allowances and usage.

Read the current part's ADRs before changing structure. Do not change a decision
already recorded in an ADR — draft a new one instead and flag it for review.

## The CALM model can be stale

ADRs and `docs/data-sources.md` win over a planned moment. If the model names a
provider or a service no decision supports, the model is wrong, not the decision.
Never edit a test or a decision to match the model.

## Reading a check failure

Every check in `architecture/fitness/` fails the same way:

    ✗ <check>: <the rule, worded as in structure.adl>
      where:   <file or directory, relative to the repo root>
      why:     <one sentence> (<structure.adl line, or the ADR>)
      fix:     <the smallest change that satisfies the rule>

Make the `fix` and run `pnpm check:arch` again. Do not edit the check, the ADL or the
model to make it pass: a rule changes through a new ADR, not through a failing build.

## Git policy

Commit only with the repo-local identity, already set in `.git/config`. Never override
it with `-c`, `--author` or `GIT_AUTHOR_*`, and never put an email address in a file.

- Never force-push, rebase, amend, squash or filter a commit that is pushed. If history
  looks wrong, stop and ask.
- Never push to `main`; it changes through a reviewed pull request, merged with a
  merge commit. A squash merge in the GitHub UI replaces the author identity.
- No `Co-Authored-By` trailers, in a commit or a pull request body.

Why: in week 1 a force-pushed rewrite closed PR #10, two fixes reached `main` with no PR,
and trailers and the wrong identity got into history. Each rule was written in a prompt and
none was enforced (ADR-0009). They are now enforced by a hook in Claude Code, the
`commit-policy` CI job and branch protection, so a blocked command is the rule working.
Follow its INSTEAD line, or stop and ask.

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
