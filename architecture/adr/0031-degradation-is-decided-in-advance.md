# ADR-0031: What switches off, and in what order, is decided in advance

## Status

Proposed

## Date

2026-11-12

## Summary

Three kill switches by configuration; order entry goes last

## Part

5

## Context

At the market open every request does one of three things: it runs now, it waits for capacity, or it degrades (a stale answer, a feature switched off, a safe refusal). Part 5's argument is that the choice should be made before the peak makes it for you.
Waiting is decided by admission (ADR-0028) and by bounded pools (ADR-0030). This ADR decides degradation: which features give way, in what order, and how, so that the order path is the last thing to give.

## Decision

Three features can be switched off by configuration, not by a code change, and each has a defined degraded behaviour. One environment variable, `BULLPEN_OFF`, holds a comma-separated list of switch names; unset or empty, everything is on. Only
`apps/web/app/lib/degradation` reads it (a rule in `structure.adl`). A name that is not a switch is ignored, so a typo cannot turn off something else.

| Order | Switch | Off means |
|---|---|---|
| 1 | `handle-moderation` | no question is asked of the model; every new or changed handle is saved and goes to review. Saving, the rules and the change limit still run |
| 2 | `leaderboard-refresh` | the view is not refreshed after a read; the last good ranking is served, and its age says how old it is. Reads are unaffected |
| 3 | `price-stream` | the stream answers 503 `stream-off`; every client falls back to polling `/api/stock-prices` |

**The order things switch off, first to last**, and why each is before the next:

1. **Handle moderation first.** It is already off the money path (ADR-0027); losing it costs a short wait for a handle to be approved by a person, and only for the few players changing a handle.
2. **The leaderboard refresh second.** A refresh takes a lock and CPU on the same compute as the orders; a ranking that is a few minutes older costs nothing a player can act on. Reads stay on.
3. **The live stream third.** Polling gives the same prices at a higher read cost per viewer, so this is the switch to pull only when the stream itself is the problem (descriptors, Active CPU), not when the database is.
4. **Then nothing is switched; what remains degrades by itself:** polling answers come back stale or 503 (the read pool's wait, 2 s), the account poll answers its 503, and the price contract flags a stale price so the ticket refuses a buy at it with `stale-price`.
5. **Order entry is the last thing to go**, and has no switch. It degrades only into a safe refusal: a 503 that says nothing was reserved, never a partial effect.

A switch is changed by changing the environment variable and redeploying. That is slower than a database flag or an Edge Config item, and it is deliberate: the alternative stores read the thing that is failing (the database), or are a Vercel setting this part does not touch.
The switches are for a peak you can see coming and a few minutes to react; the pools' bounded waits and the stale rules are what act in the first second.

## Consequences

- A kill switch is tested for what it does when off and for what it does not touch when off (`switches.test.ts`, the moderation, leaderboard and stream tests).
- Moderation is a bulkhead that already worked; this part measures it: with the moderation provider slow or down, trading latency before and after (`post-facts/part-05.md`).
- Turning a switch on or off is an owner's action in the Vercel project; the code never writes it.
- A switch that needs a redeploy cannot answer a spike that lasts one minute. The bounded waits do that, and the report says which of the stress cases each one covered.

## Alternatives

- **A feature-flag table in Postgres.** Flipped without a deploy, but read from the database that is under pressure, and moderation's flag would cross a data owner's boundary (ADR-0012).
- **Edge Config or Vercel Flags.** The right tool for a no-deploy switch, and a Vercel setting; the part's brief reserves those for the owner. This ADR's switches can move there without changing what they mean.
- **Automatic load shedding by latency.** Attractive, and untested here: a shedder that is wrong sheds the order path. Decided in advance means a person's order, not an algorithm's.
- **A switch for order entry.** Rejected. If order entry has to go, the app is down, and that is a different decision with a different owner.

## What would flip it

- A peak that the pools and the stale rules did not absorb and that outlasted a redeploy's reaction time: the switches move to Edge Config.
- A fourth feature that is expensive and expendable: it takes a place in the order above.

## Links

- ADR-0027 (handles are moderated off the money path), ADR-0014 (the leaderboard as a view), ADR-0024 (freshness), ADR-0028 (admission), ADR-0029 (the price stream), ADR-0030 (separate pools), ADR-0012 (data ownership).
- `post-facts/part-05.md` — the stress cases and what the player saw in each.
