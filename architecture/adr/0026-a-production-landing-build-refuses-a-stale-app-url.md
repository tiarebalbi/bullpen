# ADR-0026: A production landing build refuses a stale trading-app URL

## Status

Proposed

## Date

2026-10-26

## Summary

A production landing build refuses a stale trading-app URL

## Part

4

## Context

The landing links to the trading app, and `apps/landing/app/lib/webAppUrl.ts` falls back to the custom domain `https://bullpen-app.tiarebalbi.com` when `NEXT_PUBLIC_BULLPEN_WEB_URL` is unset. The code was right.

After Part 4 shipped, the live landing still linked "trading app" to the trading app's first Vercel address, a `.vercel.app` host. bullpen-landing's Vercel project still held that address in `NEXT_PUBLIC_BULLPEN_WEB_URL`, set on 2026-09-26, before the custom domain existed. A `NEXT_PUBLIC_` value is inlined at build time, so the stale value was baked into every production build since, and it overrode the right fallback. Nothing failed: the old host still answered, the build passed, every test passed (they build without the variable), and the only sign was a link that went to the wrong place.

Two ordinary things made it invisible. The value lives in Vercel's settings, not in the repository, so no review sees it. And the fallback, which is what the tests exercise, is never reached once the variable is set.

## Decision

A production landing build fails if the trading-app address it would bake in is not the custom domain, and the same rule is a `check:arch` check.

- **The guard.** When `VERCEL_ENV=production`, `apps/landing/next.config.ts` calls `assertWebUrl`, which throws unless the origin of `NEXT_PUBLIC_BULLPEN_WEB_URL` is exactly `https://bullpen-app.tiarebalbi.com`. An unset variable passes, because the fallback is that origin. The error names the variable and the value it found; the value is a public address, not a secret.
- **One constant.** `PRODUCTION_WEB_ORIGIN` in `apps/landing/lib/webUrlGuard.ts` is both the fallback and the only origin a production build accepts. The decision is a small function, `checkWebUrl`, with unit tests for a production build, a refused production value and a preview or local build.
- **Previews and local builds** accept any `https://` origin, so a preview of the landing can point at a preview of the trading app.
- **A `check:arch` check, "web url".** It holds the repo to the same rule: the guard states the origin this ADR names, the build config calls the guard, the fallback is the shared constant and not a second copy of the address, and no tracked config file (`.env*`, `vercel.json`, CI workflows, `package.json`) sets the variable to another origin. Run inside a production build, it also checks that build's value. It has no ADL line, so it is listed in the landing's rule tiles as one of the rules enforced without an ASSERT line.
- Changing the production origin is a new ADR, not an edit to a variable.

## Consequences

- A stale value now fails the production build, with a message that names the variable and the value, instead of shipping. Fixing it is a change in Vercel's settings (unset the variable, or set the custom domain), which the build cannot do.
- The guard only sees the value in the build that runs it. A value set after the build has no effect on the page, which is the point of `NEXT_PUBLIC_`; it is read again at the next build, and a bad one fails that build.
- `check:arch` cannot read Vercel's settings from a developer's or CI's machine. It checks the wiring and what the repository commits; the build's own guard checks the value.
- One more check and one more rule in the count; the landing's tiles add up with it.
- The preview rule is deliberately loose (any `https://` origin), so it cannot catch a preview that points at the wrong app.

## Alternatives

- **Remove the variable and hard-code the domain.** It fixes this case and takes away the way to point a preview at a preview app.
- **Read the address on the server at request time.** A `NEXT_PUBLIC_` value reaches client code, which the market strip needs, so the landing would need a runtime setting and an API for it, for one address that rarely changes.
- **A post-deploy check that fetches the live page and looks for the link.** It notices after the wrong page is live; this one prevents the deploy.
- **A dated reminder to review Vercel's variables.** It is what was already true, and nothing failed.

## Links

- ADR-0023 (production builds apply the migrations): the same idea, a production build that fails on a gap that would otherwise ship silently.
- ADR-0009 (rules are enforced, not written in a prompt): why this is a check and not a note in the README.
- `apps/landing/lib/webUrlGuard.ts`, `apps/landing/next.config.ts`, `architecture/fitness/src/web-url-check.ts`.
