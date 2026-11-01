# ADR-0027: Player handles are moderated by a decision model and a review queue

## Status

Accepted

## Date

2026-11-01

## Summary

Handles, shown only once a model or a person approves them

## Part

Bonus

## Context

Part 4 (ADR-0020) shows every player as a neutral label, "Player" and four hash characters, and never shows a GitHub login. Handles were left for later on purpose.
This is the later: one requirement that arrived while Part 5 was being planned, costed and scoped before it was built. A public name is text a stranger typed and every
other player reads, so the requirement is a moderation problem before it is a feature. The owner approved the direction and the scope on 2026-11-01, before the build began, which is why this ADR is Accepted and dated that day. The brief approved the dates: the bonus on 2026-11-09, Part 5 on 2026-11-16 and Part 6 on 2026-11-23.

## Change request

### Why now

- Part 4 left handles out on purpose (ADR-0020): "Player 4F2A" is neutral, and it is also a leaderboard nobody can recognise themselves on.
- The requirement arrived mid-plan, between Part 4 and Part 5. A new owner, an external model and a change to the leaderboard view are structural, so it is priced before it is built.
- The answer to a new requirement is a price, not a no: what it costs in code, in latency, in money and in the days before Part 5.

### In scope

- A signed-in player sets or changes a handle on their account page: 3 to 20 characters, letters, digits, `_` and `-`, unique ignoring case. A failing rule is a form error and no model is asked.
- A handle that passes is saved as pending. The public label stays "Player ####" until the handle is approved, everywhere, including the player's own row seen by others.
- Moderation asks one Boolean question per new or changed handle through Vercel AI Gateway, model `typesafe-ai/jev`: is this handle acceptable to show publicly?
- A probability strictly above the threshold approves the handle. Anything else goes to review.
- The review queue is a Postgres table. An admin page, for one allowlisted account, lists the handles in review with the model's probability and approves or rejects each.
- A new data owner (schema and role `handles`), and the leaderboard view joins the approved handles at its next refresh.
- Three new ADL rules, each with a fixture that fails on a deliberate violation, and a labelled set to measure the model against.

### Out of scope

- Avatars, display names, profile pages, or anything else a player can type that other players read.
- Reports from other players, appeals, and re-checking a handle that was approved.
- A queue service, a second model, or a fallback when the model fails.
- Limiting how often a player may change a handle. Every change is one decision, so the gateway budget is the cap.
- Using a GitHub login, a name or an email for anything.

## Decision

Moderate a handle with one Boolean question to a decision model, approve only a probability strictly above a threshold, and send everything else to a person through a Postgres table.

- **The question.** `POST /v1/evaluate` on Vercel AI Gateway, model `typesafe-ai/jev`, one Boolean question: "Is this handle acceptable to show publicly?", with written criteria for true (ordinary names, words and jokes that insult no one) and for false (insults, slurs, threats, sexual content, and impersonating Bullpen, its staff or a real public figure). The raw route is used, and `experimental_decide` is not, because the route's response carries the gateway's own cost field and keeps the request to exactly the handle text.
- **The threshold.** A probability strictly above it approves; a probability exactly at it goes to review. Its value and why it was chosen are in `post-facts/bonus.md`, from a run of the labelled set, and it is one constant in `apps/web/app/lib/moderation/config.ts`.
- **Every failure is review.** A timeout (2 seconds), a malformed answer, a 429, an exhausted budget, a refused key, a missing key and a tie all send the handle to review, with the reason recorded. Nothing falls back to another model, and the leaderboard and sign-in never wait on moderation.
- **The request carries only the handle text.** No user id, email, address or session in the body, the headers or any metadata. The log line has the handle's id, status, probability and latency, never the text.
- **A new owner.** Schema and role `handles` (`handles_owner`), in package `packages/db-handles`: a handle table with one row per player, and the review queue as a table. A handle has nothing to do with an order, so it is not in the `trading` transaction boundary (ADR-0012).
- **One published view.** `handles.approved_v1` (owner user id, handle) holds approved handles only. `trading_owner` has `SELECT` on it and no grant on any table in `handles`; the leaderboard view (ADR-0014) joins it and picks a new handle up at its next refresh. No new read model and no new service.
- **Three rules.** Only `apps/web/app/lib/moderation` reads `AI_GATEWAY_API_KEY` or names the gateway. Trading and market-data code never import moderation. Only `trading` writes the `trading` schema, so moderation cannot. Each is an ASSERT in `structure.adl` with a failing fixture.
- **The admin is an allowlist in config.** `apps/web/app/lib/handles/admins.ts` lists Neon Auth user ids, and anyone else gets a 404. It is a reviewed commit, not an environment variable.
- **Accepted before the build.** The direction and scope were approved on 2026-11-01, so the model may name Vercel AI Gateway (ADR-0016) and the bonus moment does; the timeline's `current-moment` stays at `part-04` until the publish pull request.

## Consequences

- Money: the price is $0.042 per 1M input tokens and a decision sends a few hundred tokens, but the free tier covering Jev is unconfirmed (`docs/data-sources.md`). The owner sets the gateway budget; when it runs out every handle goes to review, which is slow but safe.
- A new request text leaves the system: the handle goes to Vercel AI Gateway and TypeSafe. TypeSafe says it does not train on it; it states no retention period (`docs/data-sources.md`).
- Production needs two things the code cannot do: the `handles_owner` role created with `db:create-roles` and `DATABASE_URL_HANDLES` set, before the first production build after this merges, because the build applies the migrations (ADR-0023). `AI_GATEWAY_API_KEY` is the owner's to set.
- A handle in review is waiting for one person. That is the cost of "anything else goes to review", and the share of clean handles that land there is a measured number in `post-facts/bonus.md`.
- A rejected name stays taken until its player picks another, and a player may save the same handle again, which retries a decision that never arrived.
- The ADL now holds a `handles` library, so the bonus moment (not Part 4) is the latest built moment. This adds a bonus moment to ADR-0015's "latest built" in timeline order, after `part-04` and before `part-05`; ADR-0015 itself is unchanged.
- The timeline's explorer and series gain a bonus entry that has no part number. Its Part 5 and Part 6 neighbours keep their numbers.

## Alternatives

- **Not now.** Keep "Player ####" and say so. No cost, no external system, no new owner. It leaves the leaderboard anonymous, and the point of the bonus is to price the change, so this is the baseline every other option is compared with.
- **A blocklist.** A list of banned words and patterns, in code. Free, instant and deterministic, with no external system. It misses coded spellings and impersonation, blocks innocent words that contain a banned one, and needs a person to keep it current. The labelled set shows what it would accept that the model sent to review, and the reverse.
- **Human review only.** Every handle waits for a person, with no model and no external system. It never approves a bad handle by itself, and every new player waits for one person's attention, which does not hold past a handful of players.
- **A decision model plus a queue** — chosen. Most handles are decided in under a second without a person, and the ones the model is unsure of, or could not be asked about, wait for one.

## What would flip it

- The labelled-set run accepts a handle that must be rejected at every usable threshold, or sends more than 1 in 20 clean handles to review: the model costs more attention than it saves, and a blocklist plus review is the better price.
- The measured cost per decision is above $0.0001, or the p95 latency above 500 ms, and the budget or the sign-up flow feels it.
- Jev leaves the gateway, or TypeSafe's terms change to keep or train on request text.
- Review becomes more than one person can do: then a second reviewer, or a stricter threshold on a smaller player base, is the next decision.

## Links

- ADR-0020 (sign-in and the neutral label) — handles are no longer deferred.
- ADR-0012 (a schema and role per owner), ADR-0014 (the leaderboard as a view), ADR-0023 (builds apply migrations), ADR-0016 (only an Accepted decision authorizes the model).
- Vercel's [Decision docs](https://vercel.com/docs/ai-gateway/modalities/decision) (last updated 2026-10-07) and the [Jev model page](https://vercel.com/ai-gateway/models/jev), read 2026-11-01.
- `post-facts/bonus.md` — the measurements, the threshold and the answers to the brief.
