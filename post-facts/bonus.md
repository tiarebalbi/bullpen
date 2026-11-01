# Bonus: player handles, moderated — post facts

Answers to the 14 questions in the brief. Each says where it came from. **Pending** means it needs the labelled-set run, which the owner is running with a
temporary key (`apps/web/scripts/measure-moderation.ts`); nothing pending is estimated here. The threshold stays **provisional at 0.90** until the run is read
into this file.

## 1. Targets: kept or changed

Kept, as written in the brief: 0 rejects accepted; at most 1 in 20 clean sent to review; p95 latency under 500 ms; under $0.0001 a decision
(`apps/web/app/lib/moderation/measure.ts`, `TARGETS`). One caveat, not a change: p95 is measured from wherever the run starts, and the sandbox I built in reaches the
gateway's edge in `cle1`, not `iad1`; the owner's run from their own machine will say where it came from.

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

- **Threshold: 0.90, provisional.** Approved only when the probability is strictly above it; exactly at it goes to review. **Pending:** the run decides whether to keep it. The rule for choosing it: the
  lowest threshold that approves no reject (the highest probability any reject got), with a margin, unless that sends more than 1 in 20 clean handles to review, in which case the
  trade is reported and the owner decides. The script prints that number and a table of candidates.
- **Set:** 106 clean and 40 that must be rejected (146), written by me before any model saw them, none from a real player, labelled by the criteria in
  `app/lib/moderation/config.ts`; the reject set is mild and coded (leetspeak and padding), no slur spelled out, and the slur rows use placeholders, which is a weak test and is reported as such.
  Method and caveats: `apps/web/moderation-set/README.md`.

## 5. Results against each target

**Pending the owner's run.** Command (the output prints no secret, header or reject text; rejects appear by id and category):

```bash
export AI_GATEWAY_API_KEY=<a temporary key>
pnpm --filter @bullpen/web measure:moderation -- --out ../../post-facts/bonus-run.json
```

| Target | Result | Raw numbers |
| --- | --- | --- |
| 0 rejects accepted | pending | pending |
| at most 1 in 20 clean sent to review | pending | pending |
| p95 latency under 500 ms | pending | pending (p50, p95, max) |
| under $0.0001 a decision | pending | pending (the gateway's own cost field) |
| probability spread | pending | pending |

The script's format and its stops (no key; 402 no credits; 401 and 403 refusals) were checked against a stubbed gateway. A stub's numbers are not recorded here.
What is known without a run: the Decision docs' example response carries `"cost": "0.00001155"` for 275 input tokens (Vercel's [Decision docs](https://vercel.com/docs/ai-gateway/modalities/decision), last updated 2026-10-07). That is a documentation example, not a measurement.

## 6. A handle the model and a blocklist disagree on

**Pending the run.** It needs a real answer from the model. The labelled set has the shapes where they should differ: a clean handle that contains a word a blocklist
would catch (`Pork_Belly`, a commodity) against reject rows that are coded (`1d10t_…` leetspeak) that a plain word list would accept. Which way the model went is the run's to say.

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

**$1 a month.** At the Decision docs' example of $0.00001155 a decision that is about 87,000 decisions, far more than a league of this size needs: a decision happens once for each new or changed handle, never on a read.
Treat it as a ceiling, not a forecast. When it runs out every handle goes to review, which is slow but safe. Revise it from the run's measured cost per decision.

## 13. `check:arch`, and what tried to cross a rule

`check:arch passed: 12 checks held, 61 rules enforced` on the final tree (it was 11 checks and 48 rules before). During the build the checks stopped me five times, each at the moment the change needed a record:
the new package was not DEFINEd in `structure.adl`; `turbo.json` had no tag rules for `handles` (and the Trading App's allow list lacked it); the ADL named a library the latest built moment did not map (the moment now exists);
the timeline had a moment that is not a `part-0N` id (the explorer check now knows a bonus moment); and the committed rules snapshot was stale against the ADL (refreshed with the CALM CLI passing on all seven documents).
Nothing in the code crossed a rule on its own: no trading or market-data file imports moderation, and no moderation file writes `trading`.

## 14. The schedule effect

Roughly two hours and ten minutes of build time (my own estimate of the split, from the commit times) on 2026-11-01, from the go to a draft PR, spread over six pieces: the data owner and moderation (about 40 minutes), the ADL, checks and records (35), the labelled set and script (10), and the landing (45, the most of it e2e and layout work). Part 5
(Nov 16) is not at risk from the build. It is at risk from the four things only the owner can do before merge, in order (see the PR): create `handles_owner`, set `DATABASE_URL_HANDLES`, add the admin id, set the gateway budget. A production build applies migrations (ADR-0023),
so merging before the role exists fails the build. The measurement is the one open item that can still change a number in the post.

## Other things worth knowing

- **Price.** Vercel's model page says, verbatim, "Pricing: $0.042/1M input tokens" (read 2026-11-01; no output price listed). A rounded "$0.04/1M" appears in the catalogue table's row. TypeSafe's
  [models page](https://docs.typesafe.ai/models.md) says "$42 / $0.042" per billion / million tokens and "Output tokens are free".
- **The 1229px bug.** A visually hidden `position: absolute` span inside the scrolling series rail on a phone is placed relative to the page, not the rail, so it widened the page by 1229px. It was introduced by the bonus's planned-date label in this branch and caught by the existing no-sideways-scroll specs; the date is now positioned.
- **The explorer's node cards** fail axe's `label-content-name-mismatch` on every part. That is not new and not touched here; the bonus's own scrubber and change request pass axe in both themes at both widths.
- **Turbo in the sandbox.** `turbo run` fails with an exec-format error in this container, so per-package commands were run instead. CI on the pull request head is the source of truth.
- **Screenshots** at 1440 and 390, light and dark: `post-facts/screenshots/`.
