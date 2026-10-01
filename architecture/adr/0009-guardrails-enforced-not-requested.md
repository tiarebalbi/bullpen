# ADR-0009: Guardrails are enforced, not requested

## Status

Proposed

## Date

2026-09-30

## Summary

Enforce the git rules: hook, CI and branch protection

## Part

2

## Context

In week 1 an agent broke three rules I had written into its prompt. None of them was enforced anywhere, so nothing failed when they were broken:

- **Force-push.** A rewrite of the commit messages on `post-01-use-case`, stripping AI-authorship trailers, was force-pushed. GitHub closed PR #10 for good at 2026-09-26 04:17 UTC. PR #12 replaced it: opened 04:22 UTC, merged 05:01 UTC.
- **Straight to `main`.** Two fixes reached `main` without a pull request: `2a957ad` (2026-09-26 05:12 UTC) and `e7e7e8f` (2026-09-26 20:01 UTC).
- **Trailers.** `Co-Authored-By` trailers were on the original first commit (`44a27ec`, 2026-09-26 01:50 UTC) and are still in the squash message of PR #14 (`e6c0f77`, merged 2026-09-26 18:36 UTC), which is on `main` today.

A fourth problem needed no agent. I squash-merged PRs #14 (2026-09-26 18:36 UTC), #15 (19:14 UTC) and #16 (2026-09-27 03:01 UTC) in the GitHub UI, and each time GitHub replaced the repo author identity with my GitHub noreply identity. My global git name also differs from the repo's, so a commit made with the wrong configuration looks almost right.

The repo is public and file contents get harvested, so my email address must not appear in any file. That rules out the obvious way to enforce an identity: writing the address into a check.

## Decision

Enforce each rule where it can fail, in three layers, and stop relying on the prompt:

1. **A Claude Code hook.** A `PreToolUse` hook on the Bash tool blocks a force-push (`--force`, `-f`, `--force-with-lease`, `+refspec`), any push whose target is `main` (deleting it included), `rebase`, `commit --amend`, `filter-branch`, `filter-repo` and `reset --hard` on a branch that has an upstream, a commit under the wrong or an overridden identity, and a `Co-Authored-By` trailer. Every block is four lines: RULE, WHY (one sentence, citing this ADR), INSTEAD and IF STUCK. It blocks with exit code 2, which Claude Code shows to the agent as the reason. The hook is registered in my user-level Claude settings and acts only inside a clone whose remote is this repository. It is not committed, because it has to name my email address.
2. **A CI job, `commit-policy`,** on every pull request. Every commit in the PR range must carry the repo author identity and no `Co-Authored-By` line, and the failure lists each offending SHA and the fix. The identity is recognised by a fingerprint, so the address is in no file, and an `email in files` check fails if it ever lands in one.
3. **Branch protection on `main`,** which I set myself: require a pull request, require the `ci` and `commit-policy` checks by name, block force-pushes, and allow merge commits only. Merge commits only, because the UI's squash merge is what replaced the author identity.

The same principle covers the architecture record. Every check in `architecture/fitness/` fails in one format (rule, where, why, fix). An ADL rule that no check enforces fails, because a rule that cannot fail a build is documentation. And `model currency` fails when the CALM model names an external system that no decision record supports, or when an ADR is not linked from its part's moment.

## Consequences

- An agent can still ask a human to bypass a guardrail, and nothing here stops me from agreeing. Every message ends in "stop and ask", so the bypass is at least a conversation and not a silent workaround.
- The hook only runs inside Claude Code, only for commands that go through its Bash tool, and only where it is installed. It does not see a script that calls git, another tool, or the GitHub API. Claude Code reads hooks when a session starts, so a change to it applies from the next session.
- The hook is not in the repo, so CI cannot run its tests. The two layers that live in the repo are `commit-policy` and branch protection, and until I apply those settings nothing on GitHub stops a direct push to `main`.
- `commit-policy` fails a PR that contains a commit made in the GitHub UI (a squash merge, or "Update branch"), because it carries the noreply identity. I merge `main` into the branch locally instead.
- Merging with merge commits keeps the author of every commit in the PR, but the merge commit that GitHub makes in the UI still carries my GitHub identity. `commit-policy` only reads the PR's own commits, so it cannot see that one, and nothing here stops it.
- A pushed commit with the wrong identity cannot be fixed in place, because pushed history is never rewritten. The fix is a fresh branch and a new pull request, which is how #10 became #12, and the message now says so.
- The fingerprint of an address that is already in commit metadata can be guessed. It keeps the address out of file contents, where it gets harvested, not out of reach of someone determined.
- A `model currency` failure is settled by recording a decision first, not by editing the check.

## Alternatives

- **Prompt text only** — rejected. That was week 1: three rules, all stated, none enforced.
- **CI only** — rejected. CI sees a violation after it is pushed, and cannot undo a push to `main` or a closed PR. It stays as the layer that lives in the repo.
- **Git's own hooks (`pre-commit`, `pre-push`)** — rejected. `--no-verify` skips them, and they exist per clone.
- **Committing the Claude hook to the repo** — rejected. A useful block message tells the agent exactly which identity to set, which means writing my email address into a file in a public repo.

## Links

- ADR-0003 (monorepo) — the apps and libraries boundaries that `check:arch` enforces.
- ADR-0006 (React Flow explorer) — the explorer must match the CALM model; `model currency` applies the same idea to the model and the decisions.
- `.github/workflows/ci.yml` — the `commit-policy` job, and the `check:arch` step that no longer depends on `--affected`.
- `architecture/fitness/src/commit-policy-check.ts`, `architecture/fitness/src/email-in-files-check.ts` and `architecture/fitness/src/model-currency-check.ts`.
- Issues #17, #18 and #22, and pull requests #10, #12, #14, #15 and #16.
