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
other player reads, so the requirement is a moderation problem before it is a feature. The owner approved the direction and the scope on 2026-11-01, before the build began, which is why this ADR is Accepted and dated that day. The brief approved the dates: the bonus on 2026-11-11, Part 5 on 2026-11-23 and Part 6 on 2026-11-30, slipped from 11-09, 11-16 and 11-23.

## Change request

### Why now

- Part 4 left handles out on purpose (ADR-0020): "Player 4F2A" is neutral, and it is also a leaderboard nobody can recognise themselves on.
- The requirement arrived mid-plan, between Part 4 and Part 5. A new owner, an external model and a change to the leaderboard view are structural, so it is priced before it is built.
- The answer to a new requirement is a price, not a no: what it costs in code, in latency, in money and in the days before Part 5.

### In scope

- A signed-in player sets or changes a handle on their account page: 3 to 20 characters, letters, digits, `_` and `-`, unique ignoring case. A failing rule is a form error and no model is asked.
- A player may change a handle at most 5 times in 24 hours, checked before any model call: over the limit the answer is a 429 with a plain message and no gateway call. That, and the gateway budget, are what cap the cost of one player.
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
- Using a GitHub login, a name or an email for anything.

## Decision

Moderate a handle with one Boolean question to a decision model, approve only a probability strictly above a threshold, and send everything else to a person through a Postgres table.

- **The question.** `POST /v1/evaluate` on Vercel AI Gateway, model `typesafe-ai/jev`, one Boolean question: "Is this handle acceptable to show publicly?", with written criteria for true (ordinary names, words and jokes that insult no one) and for false (insults, slurs, threats, sexual content, and impersonating Bullpen, its staff or a real public figure). The raw route is used, and `experimental_decide` is not, because the route's response carries the gateway's own cost field and keeps the request to exactly the handle text.
- **The threshold.** A probability strictly above it approves; a probability exactly at it goes to review. It is one constant in `apps/web/app/lib/moderation/config.ts`, and **0.90 was provisional** until the owner ran the labelled set. The run is read into `post-facts/bonus.md`, and 0.90 is **kept** (see "Measured" below).

**Measured on 2026-11-10** (the owner's run from their own machine, 146 handles, no failures; the numbers are in `post-facts/bonus.md`). The decision above is unchanged; this records what the run said.

- Rejects accepted at 0.90: 0 of 40. The highest probability any reject got was 0.88, so 0.90 is the lowest tabulated threshold that approves none, with a margin of 0.02. At 0.85 two rejects are approved. The threshold is **kept at 0.90**.
- p95 latency 215 ms (target under 500 ms) and $0.00001608 a decision from the gateway's cost field (target under $0.0001): both met.
- **Clean handles sent to review at 0.90: 17 of 106 (16.0%), over the target of at most 1 in 20.** No threshold meets both targets on this set (approving no reject needs at least 0.88, which sends at least 10 of 106, 9.4%, to review). This is the first condition under "What would flip it", and the threshold rule says the owner decides when it holds.
- **Decided by the owner on 2026-11-10: keep 0.90.** The reason, in the owner's terms: a wrongly accepted handle is public and costs trust, while a wrongly queued one costs a short wait. The options that were on the table were keeping 0.90, lowering it to fit the 1-in-20 target (0.85 sends 4 of 106 to review but approves 2 of the 40 rejects with no person looking), and a new ADR for a blocklist plus review or a re-worded question; the first was chosen.
- **The flip condition stands, and now has a number:** a real review queue of more than 10 handles a week means rewriting the question and re-measuring. The labelled set is full of trading jokes, so its 16.0% is not a forecast of the real queue; the real queue is what is watched. Changing the decision itself is still a new ADR, not an edit of this one.
- **Every failure is review.** A timeout (2 seconds), a malformed answer, a 429, an exhausted budget, a refused key, a missing key and a tie all send the handle to review, with the reason recorded. Nothing falls back to another model, and the leaderboard and sign-in never wait on moderation.
- **The request carries only the handle text.** No user id, email, address or session in the body, the headers or any metadata. The log line has the handle's id, status, probability and latency, never the text.
- **A new owner.** Schema and role `handles` (`handles_owner`), in package `packages/db-handles`: a handle table with one row per player, and the review queue as a table. A handle has nothing to do with an order, so it is not in the `trading` transaction boundary (ADR-0012).
- **One published view.** `handles.approved_v1` (owner user id, handle) holds approved handles only. `trading_owner` has `SELECT` on it and no grant on any table in `handles`; the leaderboard view (ADR-0014) joins it and picks a new handle up at its next refresh. No new read model and no new service.
- **Three rules.** Only `apps/web/app/lib/moderation` reads `AI_GATEWAY_API_KEY` or names the gateway. Trading and market-data code never import moderation. Only `trading` writes the `trading` schema, so moderation cannot. Each is an ASSERT in `structure.adl` with a failing fixture.
- **The admin is an allowlist in config.** `apps/web/app/lib/handles/admins.ts` lists Neon Auth user ids, and anyone else gets a 404. It is a reviewed commit, not an environment variable.
- **Accepted before the build.** The direction and scope were approved on 2026-11-01, so the model may name Vercel AI Gateway (ADR-0016) and the bonus moment does; the timeline's `current-moment` stays at `part-04` until the publish pull request.

## Consequences

- Money: the price is $0.042 per 1M input tokens (Vercel's model page, read 2026-11-01) and a decision sends a few hundred tokens, but the free tier covering Jev is unconfirmed (`docs/data-sources.md`). The owner sets the gateway budget; when it runs out every handle goes to review, which is slow but safe.
- A new request text leaves the system: the handle goes to Vercel AI Gateway and TypeSafe. TypeSafe says it does not train on it; it states no retention period (`docs/data-sources.md`).
- Production needs two things the code cannot do: the `handles_owner` role created with `db:create-roles` and `DATABASE_URL_HANDLES` set, before the first production build after this merges, because the build applies the migrations (ADR-0023). `AI_GATEWAY_API_KEY` is the owner's to set.
- A handle in review is waiting for one person. That is the cost of "anything else goes to review", and the share of clean handles that land there is a measured number in `post-facts/bonus.md`.
- A handle saved but never decided (the verdict could not be recorded) stays `pending`; after 10 minutes it is listed on the admin page, in its own section, where it can be approved, rejected or retried (a retry asks the model again and is not a change by the player).
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

## Follow-up, 2026-11-10

Three changes after the bonus was published. The decision above is unchanged; this records what was added to it and why. The ADL rules still hold: reports and revocations are written by the `handles` owner only, and nothing in `trading` or `market_data` reads them.

- **Reports and taking a handle down.** The "Out of scope" list names reports from other players and re-checking an approved handle; the post that published the bonus names that as the gap. A signed-in player can now report another player's approved handle from the leaderboard, once for each reporter and handle, and not their own. A report is stored in the `handles` schema, owned by `handles_owner` (migration `0004_reports.sql`): the handle's id, the reporter's Neon Auth user id and the time, with no text from the reporter and nothing else about them (a `dismissed_at` records the admin's "this is fine"). `/admin/handles` has a "Reported" section, behind the same allowlist, that shows a count for each handle and never who reported. The admin can **revoke** a handle (its status becomes `revoked`, so `handles.approved_v1` stops publishing it and the leaderboard shows "Player ####" again at its next refresh; its reports are deleted) or **dismiss** its reports (it stays, the reporters cannot report it again, and another player's report brings it back). A revoked handle's text is remembered (`handles.revoked`: the lower-case text and the time, no player), so **nobody** can save it again, the player who had it or any other; a save of that text, in any case, gets one form error for every player ("That handle cannot be used. Try another."), whether or not its old owner still holds the row, and the answer never says that a report or an owner was involved. Whoever tries it may choose another handle. A report is about the text: a player who changes their handle starts with none. The privacy page says what a report stores. No model is asked about a report, and nothing is revoked without the admin.
- **The route is `/v1/decisions`.** Vercel's Decision docs mark `/v1/evaluate` deprecated. The request moves as the docs' mapping table says: `state` becomes `input`, the `boolean` becomes a `predicate` with its true and false criteria written into `instructions` (the same two sentences, word for word), `questions` is an array whose item carries the `name` the answer is found by, and the answers come back as an array in question order; `providerMetadata` becomes `provider_metadata`, where the cost is read. The model, the timeout and every failure rule are the same. The labelled set was run again on the new route, and that run moved the threshold from 0.90 to 0.88: see "Re-measured on /v1/decisions, 2026-11-10" below. The measure script calls the same function, so it needed no parser of its own.
- **Strict model identity.** An answer is trusted only if it names the model that was asked, exactly. Before, an answer with no `model` field was accepted and only one naming another model was refused; now a missing `model` is a failure too (`malformed`, so the handle goes to review), as are a `model` that is empty, null or not a string.

## Re-measured on /v1/decisions, 2026-11-10

The labelled set (146 handles: 106 clean, 40 that must be rejected) was run again on `/v1/decisions`, from the owner's machine, one request at a time, through the same `askGateway` the site uses (`scripts/measure-moderation.ts` calls it with the handle alone, and a test pins that the script and the save path send the same request). 0 failures. The full output is in `post-facts/bonus.md`, section 5. The model, the set and the question's two criteria are the same; the route changed, and the criteria are now one instruction string instead of two fields.

| | `/v1/evaluate` (first run) | `/v1/decisions` (this run) |
| --- | --- | --- |
| highest probability given to a reject | 0.88 | **0.86** |
| rejects accepted at 0.90 | 0 of 40 | 0 of 40 |
| clean handles sent to review at 0.90 | 17 of 106 (16.0%) | **33 of 106 (31.1%)** |
| of those, exactly at 0.90 | 4 | 11 |
| rejects accepted at 0.88 (the new threshold) | 0 of 40 | 0 of 40 |
| clean handles sent to review at 0.88 | 10 of 106 (9.4%), derived from the 17 printed | **18 of 106 (17.0%)**, derived from the 33 printed |
| p95 latency (target under 500 ms) | 215 ms | **296 ms** |
| cost a decision (target under $0.0001) | $0.00001608 | $0.00001574 |
| clean spread (min, median, max) | 0.78, 0.94, 0.97 | 0.71, 0.92, 0.98 |
| reject spread (median, max) | 0.25, 0.88 | 0.28, 0.86 |

The scores come back with two decimals: every probability in the output is a multiple of 0.01, so a score lands exactly on a threshold often, and a score exactly at the threshold goes to review because approval needs a probability strictly above it. The whole spread moved down on the new route (the clean median by 0.02, the clean minimum by 0.07), and the run cannot say whether the route or the way the criteria are given moved it. The "at 0.88" figures are derived from the printed list of clean handles under 0.90 (the run's own table has no 0.88 row); the same method reproduces the run's own 0.85 row (10 clean), and the next run prints 0.86 to 0.89 as well.

**Decision, made by the owner on 2026-11-10: apply the rule as written, so the threshold is 0.88.** The rule is the lowest threshold that approves no reject (the highest reject, 0.86) plus a margin of 0.02. `APPROVE_ABOVE` in `apps/web/app/lib/moderation/config.ts` changes from 0.90 to 0.88: a probability of exactly 0.88 goes to review and 0.89 approves, and a test pins both. At 0.88 no reject is accepted, with the margin the rule asks for, and 18 of 106 clean handles (17.0%) go to review, where 33 would at 0.90. That is still over the target of at most 1 in 20, the same kind of miss the owner accepted at 16.0% on 2026-11-10 (a wrongly accepted handle is public, a wrongly queued one costs a short wait). It is reported, not fixed. The earlier decision, "keep 0.90", was made against the first run's numbers and is superseded for the threshold only; the rest of this record, including its "What would flip it" conditions, stands, and a real queue of more than 10 handles a week still means rewriting the question and re-measuring.
