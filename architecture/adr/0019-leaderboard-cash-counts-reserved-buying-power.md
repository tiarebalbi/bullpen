# ADR-0019: The leaderboard's cash counts money held by open orders

## Status

Proposed

## Date

2026-10-20

## Summary

Cash on the leaderboard counts money held by open orders

## Part

4

## Context

ADR-0014 ranks every account by cash plus positions valued at the price contract, and defines cash as the account's
`buying_power`. That was exact while an order was one transaction and nothing was ever held. ADR-0017 makes an order
reserve buying power when it is accepted and give back what it did not spend when it ends, so for as long as an order
is open part of a player's money sits in a reservation, not in `buying_power`.

Left as it is, the board punishes a player for placing an order: an account with 10,000 that reserves 1,050 for a
10-share buy ranks as if it had 8,950 until the order ends. Two players with the same money and the same positions rank
differently because one has an order open. The ranking would measure who has orders open, not who is ahead.

## Decision

Cash on the leaderboard is the available buying power **plus what open orders have reserved and not yet spent or
released**: `buying_power + Σ(reserved − spent − released)` over the account's reservations. Equity is that cash plus
positions at the price contract, as before. The ranking is by equity, as before.

- **Equity moves only when a fill is booked or a price moves.** Reserving money, releasing it, a cancel and a
  partial fill that is paid for from the reservation do not change it, apart from the difference between what a fill cost
  and what the position is worth.
- **The view is re-created once**, by migration 0005, with the same columns and its unique index, so it still refreshes
  `CONCURRENTLY`. The on-read query that the reconciliation check compares it with changes in the same way; the check itself
  is unchanged.
- **An invariant test** states the rule: for every account a test creates, cash = available + still-reserved and equity =
  starting cash − spent + positions at the price contract, checked after every test that touches orders, and again with
  the order open, part-filled, cancelled and released.
- ADR-0014's other decisions (refresh policy, no reader waits, failed refresh keeps the last ranking, reconciliation in CI) are
  unchanged. Its definition of cash is superseded by this one.

## Consequences

- `LeaderboardRow.cash` now means available plus reserved. A screen that wants to show what is held can read the reservations;
  the ranking does not need it.
- Accounts that have never had an order rank exactly as before.
- The materialized view is dropped and re-created when migration 0005 first runs, so it holds no rows until it is refreshed.
  The migration creates it with data, so there is no gap.
- A reservation that is stuck unreleased (ADR-0017, experiment 4) still counts as the player's money. That is correct: it
  is theirs, and the flag on the order says it needs attention.

## Alternatives

- **Leave cash as `buying_power`** — rejected: the ranking would dip while an order is open.
- **Show reserved money separately and rank by the old equity** — rejected: it keeps the dip and adds a column.
- **Rank by equity less reservations plus fills only at settlement** — rejected: it hides a booked fill until the order ends.

## Links

- ADR-0014 (the leaderboard as a materialized view) — the view this changes.
- ADR-0017 (the order lifecycle) — where the reservation comes from.
