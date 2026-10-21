# ADR-0017: The order lifecycle is a Postgres state machine; the saga is for time, not for a new service

## Status

Accepted

## Date

2026-10-20

## Summary

Orders move by conditional updates, one transaction a step

## Part

4

## Context

Part 3 kept an order and its ledger entries in one transaction. A real order outlives a
transaction: buying power is reserved, zero or more fills arrive (some partial), a cancel may
arrive while fills are still on their way, and what was not used is released. The claim this
ADR tests is that this needs a saga because of time, not a new service: every step can stay one
atomic transaction in the `trading` schema, owned by the Trading App.

Accepted by the owner on 2026-10-20, before publication. Decision 1 (what drives the sweep) is
recorded in ADR-0018, with the measurements in `architecture/reports/part-04/decision-1-sweep-driver.md`.

## Decision

### States and transitions

States: `accepted`, `working`, `partially_filled`, `cancel_requested`, `cancelled`, `filled`,
`rejected`. Terminal for new fills' purposes: `filled`, `rejected`. `cancelled` accepts a late
fill (see ordering rule 3).

| From | To | Why |
|---|---|---|
| (none) | `accepted` | the order is inserted and buying power reserved, in one transaction |
| `accepted` | `working` | the venue has the order |
| `accepted` | `rejected` | the venue refused it; the reservation is released. A refusal at accept time (no price, stale price, unknown account, insufficient buying power) writes no order and reserves nothing |
| `working` | `partially_filled` | a fill for less than the open quantity was booked |
| `working` | `filled` | the open quantity filled |
| `partially_filled` | `partially_filled` | another partial fill was booked |
| `partially_filled` | `filled` | the rest filled |
| `accepted`, `working`, `partially_filled` | `cancel_requested` | the player asked to cancel |
| `cancel_requested` | `filled` | the remaining quantity filled with `executed_at` before the cancel's `effective_at` |
| `cancel_requested` | `cancelled` | the venue confirmed the cancel with an `effective_at`; the open quantity becomes `cancelled_qty` |
| `cancelled` | `filled` | a late fill, executed before `effective_at`, brought `cancelled_qty` to 0 |

Every transition is `UPDATE trading.orders SET state = $to, version = version + 1 … WHERE order_id
= $1 AND version = $v AND state = ANY($from)`. Zero rows updated means someone else moved the
order: the caller re-reads and decides again, it never writes back what it read.

### Quantities and money

- `filled_qty + open_qty + cancelled_qty = quantity` always (a CHECK on the row).
- A buy reserves `quantity × cap_price`, where `cap_price` is the latest `prices_v1` price at
  accept time times (1 + 5 %). That is a ceiling on what the order can cost, not a price it is
  promised.
- `reserved`, `spent` and `released` live on the reservation row. For every account:
  `buying_power + Σ(reserved − spent − released) + Σ(spent) = starting_cash`, and `buying_power
  ≥ 0` (already a CHECK).
- A fill books `quantity × price` into `spent`, one ledger entry pair, and the position. Only
  `reserved − spent − released` is ever released, and only once (`released_at` is set by the
  same conditional UPDATE that moves the money).

### The simulator's ordering rules (Decision 3, written before the code)

1. A fill has a unique `fill_id`, a `quantity`, a `price` and an `executed_at` (venue time).
   Delivery is at-least-once and unordered: a fill can be delivered twice, late, or after the
   cancel was confirmed.
2. A cancel request is not a cancel. The venue confirms it with an `effective_at`. Every fill
   with `executed_at < effective_at` exists and is owed to the account, wherever it arrives. No
   fill with `executed_at ≥ effective_at` exists.
3. So the lifecycle books a fill when the order is in any state except `rejected`, provided
   `executed_at < effective_at` (or no `effective_at` is known yet). A fill that breaks this is
   not booked: it is recorded as an anomaly and the order is flagged `needs_attention`.
4. A booked fill is never undone. Partial fill plus cancel: book the filled quantity, cancel
   the rest, release only the unused reservation.
5. A duplicate `fill_id` changes nothing: `INSERT … ON CONFLICT (fill_id) DO NOTHING`, and the
   rest of the transaction runs only if a row was inserted.
6. Release is separate from cancel. It is allowed only after `effective_at +
   LATE_FILL_WINDOW` (the simulator's stated bound on delivery delay), and it is a step the
   sweep retries. A late fill after release is booked by taking the money back with a
   conditional UPDATE; if that cannot be funded the fill is stored unbooked and the order is
   flagged. It is never silently dropped and never booked into a negative balance.
7. About 10 % of eligible fills are partial, with a seeded random size, following the
   behaviour Alpaca documents for paper trading. This is a simulator, not a claim about Alpaca.

### Fill price

The simulator fills at the latest `market_data.prices_v1` price. If that price is older than
`MAX_FILL_PRICE_AGE` (5 minutes) or flagged `stale`, the simulator holds the order (it stays
`working`, nothing fills). If the price is above the order's `cap_price` it also holds. An
order that is held for longer than `WORKING_DEADLINE` (15 minutes) is cancelled by the sweep
with reason `no-fillable-price`. At accept time a missing or stale price rejects the order, as
in Part 3.

### Everything needed to explain and recover an order stays in Postgres

`order_events` (append-only, one row per transition, fill, anomaly, release attempt), `fills`,
`reservations`. Workflow run history on Hobby lasts one day; the database is the record.

### Decision 1: what drives the sweep

The baseline is a sweep function that finds stuck orders and advances or flags them, with every step idempotent, so any driver can
call it. What calls it is decided in ADR-0018.

## Consequences

- Money, quantity and state are checked in the database, not in code that read them first.
- The leaderboard's cash is `buying_power`; money held by an open reservation is not in it, so a
  player's equity dips while an order is open. Whether the leaderboard should count reserved
  money is a question for a follow-up ADR, because it changes the view (ADR-0014).
- The simulator's rules are mine, not Alpaca's. A real adapter would have to meet rules 1 to 6
  or change them in a new ADR.

## Alternatives

- **A workflow engine from the start** — not chosen before the baseline passes every test; kept
  as a candidate and judged by what it measurably adds.
- **One long transaction per order** — rejected: a transaction cannot outlive a request, and
  the cancel race is exactly what it would hide.
- **Undo a fill when a cancel wins** — rejected: a fill that happened is a fact.

## Links

- ADR-0012 (schema and role per owner) — the lifecycle stays inside `trading`.
- ADR-0014 (leaderboard as a materialized view) — reconciliation must keep passing.
- ADR-0016 (only Accepted authorizes the model) — this ADR cannot authorize a CALM node until accepted.
