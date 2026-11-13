# ADR-0028: Orders placed while the market is closed wait in Postgres and are admitted in batches at the open

## Status

Proposed

## Date

2026-11-12

## Summary

Queue in Postgres, admit in batches, wake at 9:30 ET

## Part

5

## Context

Part 5's question is where the work waits when the market opens. Bullpen's stock prices are end-of-day closes (ADR-0024), but a player can place a stock order at any hour, and the busiest minute of the day is the one
after 9:30 ET, when everyone who ordered overnight and everyone who just opened the app arrive together. Until now an order placed while the market was closed was accepted as `accepted` and handed to the venue at once;
nothing in the lifecycle knew the market had hours.

The week-one model (`architecture/calm/planned/part-05`, tag `predictions-week-1`) predicted a **Market Open Queue** (Vercel Queues or equivalent) and an **Order Saga workflow engine**. ADR-0017 had already decided that the
saga is a set of conditional transactions in Postgres, not a service. This ADR answers the question that decision left open, **admission**: how a burst of eligible orders is scheduled without overwhelming capacity. It does not
reopen ADR-0017: every move in its table stays as it is, and one state and three moves are added.

## Decision

### The state

`queued_for_open` is added to the order lifecycle (ADR-0017's table gains these rows, and no row of it changes):

| From | To | Why |
|---|---|---|
| (none) | `queued_for_open` | a stock market order is placed while the market is closed: it is inserted and buying power reserved at the ceiling (accept-time price x 1.05, ADR-0017), in one transaction, exactly as for `accepted`. The venue does not see it |
| `queued_for_open` | `accepted` | admission at the open (below) |
| `queued_for_open` | `rejected` | admission at the open found no fresh price, or not enough buying power for the top-up; the whole reservation is released in the same transaction |
| `queued_for_open` | `cancelled` | the player cancelled before the open. The venue never had the order, so there is no cancel to confirm and no late fill to wait for: the order is cancelled and the whole reservation released in one transaction (`cancel_requested` is not used) |

Every move is a conditional update on the order's state and version, so a repeat, a retry after a crash, two sweeps at once, or a cancel that races an admission each end one way (`already`, or a retry that reads the new state).
A queued order takes no fill (`fillBucket` is null for it). The migration is `0008_queued_for_open.sql`: the state check gains the value, and a partial index on `created_at` keeps the admission read to the queue.

### What is queued

A stock order (its price in `prices_v1` has kind `end-of-day`, ADR-0024) submitted when `isMarketOpen(now)` is false. A live (crypto) price is never queued. The calendar is `packages/contracts/src/marketCalendar.ts`: regular hours 9:30-16:00
America/New_York, weekends, the NYSE holidays of 2026 and 2027 and its three early closes (13:00 on 2026-11-27, 2026-12-24 and 2027-11-26), read from NYSE's "Holidays & Trading Hours" page (https://www.nyse.com/trade/hours-calendars,
read 2026-11-12), which lists 2026-2028. DST is the platform's (`Intl`, America/New_York); the 9:30 of a day is 9:30 in EST and in EDT, and a test holds both clock changes of 2026. Outside 2026-2027 only weekends are known
(`calendarCovers` says so); the calendar needs another year added before 2028-01-01, which a test of the lists' range will remind whoever forgets.
The calendar is a contract-level module because three things must agree on it: the trading library (to queue), the sweeper's route (to say when the next open is) and the screens (to say when an order will be released).
It deliberately does not make a price.

The lifecycle's own tests and measurements place orders at any hour, so `submitOrder` gates on the market's hours only when the caller passes `marketHoursAt`; the player-facing path (`placePlayerOrder`) always does.

### Admission

The opening event makes the backlog eligible; it does not execute everything at 9:30:00. Each sweep pass, while the market is open, admits at most **`ADMIT_BATCH_SIZE` = 100** queued orders, oldest first (`created_at`, then id), and
stops starting admissions after **`ADMIT_BUDGET_MS` = 8 s**, so a slow database makes a short batch instead of a request that outlives the sweeper's 20 s timeout. At the sweeper's 5 s cadence that is **20 orders a second; a backlog of 1,000
is admitted in about 50 s**. Each admitted order is handed to the venue in the same pass (`dispatchOrder`, idempotent; if the pass dies between the two, the existing `accepted` step finds it after 30 s).
A player's own poll never admits a queued order (it would turn the batch into a stampede of 1,000 simultaneous admissions at 9:30:00); it shows it as queued until the batch reaches it.

Measured on a local stack, not on Vercel or Neon (`post-facts/part-05.md`): 1,000 queued orders were admitted in 55.9 s with 400 requests a second of other traffic, the real sweeper waking 506 ms after the open, and 100 admissions
finished inside one second of each pass on a full core. On a database held to a quarter of a core (an approximation) the same step took 148 s and was overloaded, so the batch is not what limits it there. The batch stays at 100; the
number that decides whether it is right is the compute's, and that needs the Neon branch run.

### The price rule at release

The order reserved `quantity x ceiling` at the price the player saw. At admission:

1. **Same close (the normal case):** the price in the contract is at or below the ceiling. Nothing changes.
2. **Price above the ceiling** (a new close landed overnight, or the simulator injected an opening price): the ceiling is re-taken at the new price with the same margin (`round(price x 1.05, 8)`), and the difference
   `quantity x (new ceiling - old ceiling)` is moved from buying power to the reservation, in the admission transaction. The order is then admitted at the new ceiling, so the venue's own rule (a fill only at or under the ceiling) lets it fill.
3. **Buying power cannot cover the top-up:** the order is rejected (`insufficient-buying-power-at-open`) and the full reservation is released, in the same transaction.
4. **No price, or a stale one** (older than the latest completed trading day, ADR-0024): rejected the same way (`no-price`, `stale-price`).

Cash only moves between available and reserved, and the order's quantities only between open and cancelled, so each path keeps Part 4's invariants (ADR-0017, ADR-0019): buying power is never negative, available + reserved + spent equals starting cash,
and `filled + open + cancelled = quantity`. The integration tests check them after every case.

### The sweeper is awake for the open

ADR-0021 lets the sweeper's idle wait reach 60 minutes, so the open could pass in the middle of a sleep. The sweep route's reply gains `nextOpen` (the next 9:30 ET on a trading day, from the one calendar) and the sweeper never sleeps
past it (plus a 500 ms margin so a timer that fires a few milliseconds early does not call before the open). The backoff itself is not shortened: after the open call it carries on from where it was. The sweeper has no calendar of
its own: its image is built from its directory alone with no dependencies (ADR-0018), and a second calendar is how ADR-0024's two freshness rules disagreed. The cost is one extra call per trading day.
A queued order never holds the fast cadence while the market is closed (`open` counts it only when the market is open): a weekend of queued orders must not keep Neon awake at 5 s intervals (ADR-0021's condition for a flagged order, applied to a waiting one).
The reply also counts `queued`, `admitted`, `toppedUp` and `admissionRejected`.

## Consequences

- A stock order placed overnight no longer reaches the venue before the open; the order row and the ticket say "Queued for the open (Mon 9:30 ET)", the money is set aside, and the player can cancel with the whole reservation back.
- The burst at 9:30 is metered by one number, the batch, that can be changed without a deploy of anything but the Trading App. A backlog larger than 100 x passes-per-second is visible as `queued` in the sweep reply.
- Admission is a place where work waits that is a database row, not a cache and not a service: it survives a restart and costs nothing while the market is closed.
- Early closes are handled by the calendar, but nothing releases at the early close: orders arriving after 13:00 on those three days are queued for the next open like any after-hours order.
- The admission step trusts the sweeper. If the sweeper is down at the open, queued orders wait: nothing else admits them. The sweeper's health is already what the cost and alerting work watches; a missed open is visible as a growing `queued`.
- The lifecycle gains a state, so every place that lists states (the contract schema, the screens, the timeline) changed in this PR; `states.test.ts` pins the transition table exactly.

## Alternatives

- **A Market Open Queue (Vercel Queues or similar) feeding an Order Saga workflow engine** (the week-one prediction). Rejected: the order is already durable in Postgres before anything else happens, so a queue would hold a second copy of an order whose
  authoritative state is a row, and a workflow engine would drive transitions that are already conditional updates (ADR-0017). It would add a service, a bill line and a failure mode, to hold work Postgres already holds.
- **Admit everything at 9:30:00.** Simplest, and it is the stampede this part is about: the whole backlog becomes venue work and database writes in one second, on a 0.25 CU compute shared with every reader.
- **A cron at 9:30 ET.** Vercel Hobby cron runs once a day with a window of up to an hour, which is not an open. The sweeper already exists and already touches the same tables.
- **The player's own poll admits its own queued order** (ADR-0018's pattern for working orders). Rejected for admission specifically: it gives up the batch, since 1,000 players polling at 9:30 would admit 1,000 orders in the same second.
- **The sweeper keeps its own copy of the calendar.** Rejected: a second calendar can disagree with the first.
- **Admission by LISTEN/NOTIFY.** Not available: the pooler runs in transaction mode.

## What would flip it

- A measured admission cost, or drain time, that is far from the numbers above (the batch size or cadence changes, not the design).
- A second market with different hours (the calendar becomes a per-market lookup).
- A venue that must be given the order before the open (an opening auction): `queued_for_open` would then be released to the venue at an earlier time, not at the open.

## Links

- ADR-0017 (the order lifecycle as a Postgres state machine; this ADR adds one state and three moves to its table), ADR-0018 (the sweeper is a daemon that calls a route), ADR-0021 (the sweeper's idle wait is sixty minutes), ADR-0024 (freshness depends on the price kind), ADR-0019 (the leaderboard's cash counts reserved buying power).
- NYSE, [Holidays & Trading Hours](https://www.nyse.com/trade/hours-calendars), read 2026-11-12.
- `post-facts/part-05-predictions.md` — what I predicted about the queue before any load test ran. `post-facts/part-05.md` — the measurements.
