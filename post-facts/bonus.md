# Bonus: player handles, moderated — post facts

Answers to the 14 questions in the brief. Each says where it came from. The labelled-set run (`apps/web/scripts/measure-moderation.ts`) was made by the owner
with a temporary key and read into this file on 2026-11-10; its numbers below are the numbers in the output the owner pasted back, and nothing here is estimated.
The threshold is **kept at 0.90**, decided by the owner on 2026-11-10 (section 4). One target is missed, and the owner accepted that (section 4).

## 1. Targets: kept or changed

Kept, as written in the brief: 0 rejects accepted; at most 1 in 20 clean sent to review; p95 latency under 500 ms; under $0.0001 a decision
(`apps/web/app/lib/moderation/measure.ts`, `TARGETS`). One caveat, not a change: p95 is measured from wherever the run starts. The run was made from the owner's own machine
(darwin arm64, node v26.13.0, not Vercel), and the gateway's nearest edge answered from `pdx1`; a Vercel function would measure its own number.

## 2. Is Jev in the free tier?

**Not confirmed.** Vercel's [pricing page](https://vercel.com/docs/ai-gateway/pricing) (last updated 2026-09-08, read 2026-11-01) says every team has a monthly free
credit on "a subset of models, not the full catalog", with no dollar amount. [The Jev model page](https://vercel.com/ai-gateway/models/jev) (read 2026-11-01) shows a price and
no free label. The catalogue's `freeTier=true` URL lists Jev's rows but is not filtered (it also lists paid models), so its presence there proves nothing. If the
team has no credits the measurement script says so plainly and stops (HTTP 402); a top-up is the owner's decision.

## 3. TypeSafe's terms for request text

TypeSafe says it does not train or fine-tune models on input and does not disclose it to third parties other than its service providers; it states no retention
period or request-logging policy, and offers zero data retention to enterprise customers only ([privacy policy](https://typesafe.ai/privacy), last updated 2025-11-19;
[models page](https://docs.typesafe.ai/models.md); read 2026-11-01). Vercel says the gateway itself does not retain prompt content ([FAQ](https://vercel.com/docs/ai-gateway/faq), last updated 2026-09-13).
Only the handle text is sent: no user id, email, address or session (test: `gateway.test.ts`).

## 4. Threshold, and the labelled set

- **Threshold: 0.90, kept (it was provisional until the run).** Approved only when the probability is strictly above it; exactly at it goes to review. The rule for choosing it: the
  lowest threshold that approves no reject (the highest probability any reject got), with a margin, unless that sends more than 1 in 20 clean handles to review, in which case the
  trade is reported and the owner decides. Applied to the run: the highest probability any reject got is **0.88**, so a threshold strictly above 0.88 approves no reject; 0.90 is that plus a
  margin of 0.02, and the next candidate down, 0.85, approves 2 of the 40 rejects. So 0.90 is the lowest safe threshold with a margin, and it stays.
- **The trade, and the owner's decision.** At 0.90, **17 of 106 clean handles (16.0%) go to review, where the target is at most 1 in 20.** No threshold meets both targets on this set:
  approving no reject needs a threshold of at least 0.88 (the highest reject), and from the 17 printed probabilities that sends at least 10 of 106 clean handles (9.4%) to review at 0.88, and 17 at 0.90; the first tabulated threshold that sends 1 in 20 or fewer, 0.85 (4 of 106, 3.8%), approves 2 rejects.
  The rule leaves this to the owner, and **the owner decided on 2026-11-10: keep 0.90.** The reason: a wrongly accepted handle is public and costs trust, while a wrongly queued one costs a short wait. The miss is accepted, not fixed.
- **What would reopen it:** a real review queue of more than 10 handles a week means rewriting the question and re-measuring (ADR-0027's first "what would flip it" condition, with that number). The labelled set is full of trading jokes, so its 16.0% is not a forecast; the real queue is what is watched.
- **Set:** 106 clean and 40 that must be rejected (146), written by me before any model saw them, none from a real player, labelled by the criteria in
  `app/lib/moderation/config.ts`; the reject set is mild and coded (leetspeak and padding), no slur spelled out, and the slur rows use placeholders, which is a weak test and is reported as such.
  Method and caveats: `apps/web/moderation-set/README.md`.

## 5. Results against each target

The owner's run, from their own machine (146 handles, one request at a time, 0 failures, no refusal from the gateway). Command (the output prints no secret, header or reject text; rejects appear by id and category):

```bash
export AI_GATEWAY_API_KEY=<a temporary key>
pnpm --filter @bullpen/web measure:moderation -- --out ../../post-facts/bonus-run.json
```

| Target | Result | Raw numbers |
| --- | --- | --- |
| 0 rejects accepted | **met** | 0 of 40 at 0.90 |
| at most 1 in 20 clean sent to review | **MISS** | 17 of 106 (16.0%) at 0.90; the allowed 1 in 20 is about 5 of 106 |
| p95 latency under 500 ms | **met** | p50 156 ms, p95 215 ms, max 311 ms, measured from the owner's machine |
| under $0.0001 a decision | **met** | $0.00001608 a decision, from the gateway's own cost field; $0.002347 in all for 146 |
| probability spread | reported | clean: n=106, min 0.78, p05 0.87, median 0.94, p95 0.96, max 0.97. reject: n=40, min 0.02, p05 0.03, median 0.25, p95 0.84, max 0.88 |

Three of the four targets are met. The reject set is the model's weak spot: 10 of the 40 rejects scored above 0.5, 4 above 0.8 and 2 above 0.85 (the highest, 0.88), which is why the safe threshold is as high as 0.90.
The 17 clean handles sent to review, by id and probability: clean-004 LunaLovegood 0.90, clean-005 PaperHands 0.86, clean-007 bull_run_bob 0.87, clean-018 PixelPirate 0.81, clean-035 Pork_Belly 0.87, clean-037 Gold_Digger_Gus 0.78,
clean-046 Blue_Chip_Bill 0.87, clean-047 Market_Monk 0.89, clean-050 Stop_Loss_Steve 0.89, clean-051 Limit_Order_Lou 0.89, clean-052 Hedge_Fund_Hank 0.87, clean-055 Put_It_On_Red 0.83, clean-058 Buy_the_Dip 0.90, clean-062 Astro_Alex 0.90,
clean-070 River_Rat 0.87, clean-080 Card_Counter_Cal 0.80, clean-094 Paint_Brush_Pat 0.90. Four of them (clean-004, -058, -062, -094) sit at exactly 0.90 and go to review because a probability must be strictly above the threshold.

| threshold | rejects accepted | clean to review |
| --- | --- | --- |
| 0.5 | 10 | 0 |
| 0.6 | 8 | 0 |
| 0.7 | 6 | 0 |
| 0.8 | 4 | 2 |
| 0.85 | 2 | 4 |
| **0.9** | **0** | **17** |
| 0.95 | 0 | 87 |
| 0.98, 0.99, 0.995 | 0 | 106 |

The measured cost is about 39% above the Decision docs' example below (`$0.00001608` against `$0.00001155`), and still about six times under the target. The run's JSON (`bonus-run.json`: ids, probabilities, latencies and costs, no handle text) is on the owner's machine and is not in this repository.
The script's format and its stops (no key; 402 no credits; 401 and 403 refusals) were checked against a stubbed gateway before the real run. A stub's numbers are not recorded here.
For comparison, the Decision docs' example response carries `"cost": "0.00001155"` for 275 input tokens (Vercel's [Decision docs](https://vercel.com/docs/ai-gateway/modalities/decision), last updated 2026-10-07). That is a documentation example, not a measurement.

## 6. A handle the model and a blocklist disagree on

There is no blocklist in the code, so "a blocklist" here is a small, plain substring list I wrote only to compare (it flags a handle that contains words such as `ass`, `die`, `hell`, `sex`, `kill`). It is not a decision and not a tested filter. The model's side comes from the run: a handle absent from the 17 sent to review was approved (the run had no failures, so its probability was above 0.90).
The same clean set, two ways, both on real run data:

- **The model approved, the blocklist would block:** `Espresso_Eddie` (clean-030, contains `die`) and `Bass_Line` (clean-086, contains `ass`), both ordinary handles. A substring blocklist blocks two innocent players that the model let through.
- **The model sent it to review, the blocklist would approve:** `LunaLovegood` (clean-004, probability 0.90, exactly at the threshold) and `Pork_Belly` (clean-035, 0.87). Nothing in either is on a word list, and a person looks at both.

Only half of the reverse case is shown here: whether a coded reject (`1d10t_…` leetspeak) that a plain word list would accept was caught by the model needs each reject's own probability, which is in `bonus-run.json` on the owner's machine and not in the run's printed output. The printed output says only that 30 of the 40 rejects scored 0.5 or less.

## 7. The CALM diff for the bonus moment

- New moment `bonus-handles` in `bullpen.timeline.json`, between `part-04` and `part-05`; `current-moment` stays `part-04` until the publish pull request. New file `moments/bonus-handles.architecture.json`; CI validates it with the CALM CLI strictly, as Parts 1 to 3.
- New nodes: `vercel-ai-gateway` (external system), `schema-handles`, `approved-handles-v1`.
- New edges: `trading-app-to-ai-gateway` (HTTPS), `trading-app-to-handles-schema` (as `handles_owner`), `trading-app-to-approved-handles-v1` (read only, as `trading_owner`).
- Changed: `trading-app` lists `packages/db-handles` and the two new settings; `bullpen-database` names the third schema and the second view; `database-composition` holds the two new data assets.
- Explorer content `content/architecture/bonus-handles.json` draws the same, and `explorer consistency` holds the two together.

## 8. Schema and role

Schema `handles`, role `handles_owner`, package `packages/db-handles`. A handle has nothing to do with an order, so it is not inside the `trading` transaction boundary (ADR-0012: one
owner per transaction). One row per player (`handles.handle`, unique ignoring case), the review queue as a table (`handles.review_queue`), and one published view, `handles.approved_v1`.
`trading_owner` has `SELECT` on that view and nothing else in the schema; `handles_owner` has nothing in `trading` (database tests prove both).

## 9. The leaderboard view change

Migration `packages/db-trading/migrations/0007_leaderboard_shows_approved_handles.sql` re-creates `trading.leaderboard_mv` once: it left-joins `handles.approved_v1` on
`owner_user_id` and shows `COALESCE(h.handle, a.handle)`, so only an approved handle replaces the neutral label, at the next refresh. The on-read SQL the reconciliation check compares against changed identically.
Test: a pending, review and rejected handle all show the neutral label after a refresh; an approved one shows.

## 10. ADR numbers and statuses

- **ADR-0027** (new): Accepted, dated 2026-11-01, "the owner approved the direction and scope on 2026-11-01, before the build". The brief asked for Proposed; the owner chose Accepted when I flagged the conflict, because ADR-0016 lets only an Accepted ADR authorize the gateway as an external system in the model. The threshold in it is marked provisional.
- **ADR-0020**: still Accepted; handles are no longer deferred, and it links ADR-0027.
- ADR-0015 is unchanged. ADR-0027 records that the latest built moment is placed by the part a bonus follows, so the bonus (not Part 4) is the latest built moment while `handles` is in the ADL.

## 11. The ADL lines as written, and the failing-fixture output for each

```
ASSERT(Trading App IS DEPENDENT ON UI, Contracts, trading, handles)
ASSERT(handles HAS NO DEPENDENCY ON Landing, Trading App, Market Data Service, Sweeper, UI, trading, market-data)
ASSERT(trading HAS NO DEPENDENCY ON handles)
ASSERT(market-data HAS NO DEPENDENCY ON handles)
ASSERT(Market Data Service HAS NO DEPENDENCY ON handles)
ASSERT(Landing HAS NO DEPENDENCY ON handles)
ASSERT(Sweeper HAS NO DEPENDENCY ON handles)
ASSERT(ONLY apps/web/app/lib/handles READS DATABASE_URL_HANDLES)
ASSERT(ONLY apps/web/app/lib/moderation READS AI_GATEWAY_API_KEY)
ASSERT(ONLY apps/web/app/lib/moderation READS ai-gateway.vercel.sh)
ASSERT(NO packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading IMPORTS apps/web/app/lib/moderation)
ASSERT(ONLY trading WRITES trading)
ASSERT(ONLY handles WRITES handles)
ASSERT(trading READS handles ONLY THROUGH handles.approved_v1)
```

Each rule has a fixture that fails on a deliberate violation (`architecture/fitness/src/__fixtures__/moderation-*`, tests in `moderation-rules.test.ts`). The output, as the checks print it:

```
## 1 gateway
✗ secret containment: ONLY apps/web/app/lib/moderation READS AI_GATEWAY_API_KEY
  where:   apps/web/app/lib/trading/leak.ts:2
  why:     apps/web/app/lib/trading/leak.ts reads AI_GATEWAY_API_KEY, which only apps/web/app/lib/moderation may read, so the secret stays in one place (structure.adl:7).
  fix:     Move the read into apps/web/app/lib/moderation and pass the result out, or call that route instead of reading AI_GATEWAY_API_KEY here.

✗ secret containment: ONLY apps/web/app/lib/moderation READS ai-gateway.vercel.sh
  where:   apps/web/app/lib/trading/leak.ts:3
  why:     apps/web/app/lib/trading/leak.ts reads ai-gateway.vercel.sh, which only apps/web/app/lib/moderation may read, so the secret stays in one place (structure.adl:8).
  fix:     Move the read into apps/web/app/lib/moderation and pass the result out, or call that route instead of reading ai-gateway.vercel.sh here.

## 2 imports
✗ import boundaries: NO packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading IMPORTS apps/web/app/lib/moderation
  where:   packages/db-trading/src/leak.ts:1
  why:     packages/db-trading/src/leak.ts imports ../../../apps/web/app/lib/moderation/moderate.js, which is apps/web/app/lib/moderation, and code in packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading may not (structure.adl:10).
  fix:     Remove the import. If packages/db-trading/src/leak.ts needs what apps/web/app/lib/moderation does, move that into code both may import, or ask for a new decision (an ADR).

✗ import boundaries: NO packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading IMPORTS apps/web/app/lib/moderation
  where:   apps/market-data/src/leak.ts:1
  why:     apps/market-data/src/leak.ts imports ../../web/app/lib/moderation/moderate.js, which is apps/web/app/lib/moderation, and code in packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading may not (structure.adl:10).
  fix:     Remove the import. If apps/market-data/src/leak.ts needs what apps/web/app/lib/moderation does, move that into code both may import, or ask for a new decision (an ADR).

✗ import boundaries: NO packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading IMPORTS apps/web/app/lib/moderation
  where:   apps/web/app/lib/trading/leak.ts:1
  why:     apps/web/app/lib/trading/leak.ts imports ../moderation/moderate.js, which is apps/web/app/lib/moderation, and code in packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading may not (structure.adl:10).
  fix:     Remove the import. If apps/web/app/lib/trading/leak.ts needs what apps/web/app/lib/moderation does, move that into code both may import, or ask for a new decision (an ADR).

## 3 writes
✗ data ownership: ONLY trading WRITES trading
  where:   apps/web/app/lib/moderation/bad.ts:2
  why:     apps/web/app/lib/moderation/bad.ts writes trading, which only trading (packages/db-trading) may write (structure.adl:9).
  fix:     Move the write into packages/db-trading, or ask trading to expose it.

✗ data ownership: ONLY trading WRITES trading
  where:   packages/db-handles/migrations/0003_bad_grant.sql:1
  why:     packages/db-handles/migrations/0003_bad_grant.sql grants a write on trading to handles_owner, but only trading_owner (trading) may write it (structure.adl:9).
  fix:     Remove the grant to handles_owner; only trading_owner writes trading.

✗ data ownership: a migration in one owner's folder touches only that owner's schema
  where:   packages/db-handles/migrations/0003_bad_grant.sql:1
  why:     packages/db-handles/migrations/0003_bad_grant.sql is one of handles's migrations but touches trading.accounts, which belongs to another owner (ADR-0012).
  fix:     Move the change into the migration folder of the owner of trading, or drop it from packages/db-handles/migrations/0003_bad_grant.sql.
```

## 12. A suggested AI Gateway budget

**Suggested $1 a month; the owner set $5, with an alert at 75%.** At the measured $0.00001608 a decision, $1 is about 62,000 decisions and $5 about 311,000 (at the Decision docs' example of $0.00001155 they would have been about 87,000 and 433,000). Either is far more than a league of this size needs: a decision happens once for each new or changed handle, never on a read.
Treat it as a ceiling, not a forecast. When it runs out every handle goes to review, which is slow but safe.

## 13. `check:arch`, and what tried to cross a rule

`check:arch passed: 12 checks held, 61 rules enforced` on the final tree (it was 11 checks and 48 rules before). During the build the checks stopped me five times, each at the moment the change needed a record:
the new package was not DEFINEd in `structure.adl`; `turbo.json` had no tag rules for `handles` (and the Trading App's allow list lacked it); the ADL named a library the latest built moment did not map (the moment now exists);
the timeline had a moment that is not a `part-0N` id (the explorer check now knows a bonus moment); and the committed rules snapshot was stale against the ADL (refreshed with the CALM CLI passing on all seven documents).
Nothing in the code crossed a rule on its own: no trading or market-data file imports moderation, and no moderation file writes `trading`.

## 14. The schedule effect

Roughly two hours and ten minutes of build time (my own estimate of the split, from the commit times) on 2026-11-01, from the go to a draft PR, spread over six pieces: the data owner and moderation (about 40 minutes), the ADL, checks and records (35), the labelled set and script (10), and the landing (45, the most of it e2e and layout work). Part 5
(Nov 23, after the schedule slipped from Nov 16) is not at risk from the build. It was at risk from the four things only the owner can do before merge, in order (see the PR): create `handles_owner`, set `DATABASE_URL_HANDLES`, add the admin id, set the gateway budget. On 2026-11-10 the owner reported three done (`handles_owner` created with `db:create-roles`, `DATABASE_URL_HANDLES` set for Production, a $5 gateway budget with an alert at 75%); the admin id is the one still open here. A production build applies migrations (ADR-0023),
so merging before the role exists fails the build. The measurement was run and is read into this file, the owner decided to keep 0.90 and accept the clean-to-review miss (section 4), and the admin id the owner gave is in `admins.ts`; nothing from the owner is still open.

## Other things worth knowing

- **Price.** Vercel's model page says, verbatim, "Pricing: $0.042/1M input tokens" (read 2026-11-01; no output price listed). A rounded "$0.04/1M" appears in the catalogue table's row. TypeSafe's
  [models page](https://docs.typesafe.ai/models.md) says "$42 / $0.042" per billion / million tokens and "Output tokens are free".
- **The 1229px bug.** A visually hidden `position: absolute` span inside the scrolling series rail on a phone is placed relative to the page, not the rail, so it widened the page by 1229px. It was introduced by the bonus's planned-date label in this branch and caught by the existing no-sideways-scroll specs; the date is now positioned.
- **The explorer's node cards** fail axe's `label-content-name-mismatch` on every part. That is not new and not touched here; the bonus's own scrubber and change request pass axe in both themes at both widths.
- **Turbo in the sandbox.** `turbo run` fails with an exec-format error in this container, so per-package commands were run instead. CI on the pull request head is the source of truth.
- **Review changes after the PR opened.** A player may change a handle at most 5 times in 24 hours (checked before any model call; over it, a 429 and no gateway call); handles `pending` for more than 10 minutes are listed on the admin page, in their own section, with approve, reject and retry; and a save is one transaction (the upsert, the queue delete and the change count together).
- **Screenshots** at 1440 and 390, light and dark: `post-facts/screenshots/`.
