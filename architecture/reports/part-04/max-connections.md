# max_connections on the production compute

Date: 2026-10-20, 16:50 (local time of the console session).

## The reading

`SHOW max_connections` returned **112** on the Neon production branch (database `neondb`, primary compute, Active).
I read it in the Neon console SQL editor myself, not through `DATABASE_URL_TRADING` and not from a script; the
console's query history shows it at "Oct 20, 2026 - 4:50pm". I did not print or handle any connection string.

Earlier readings on the same branch: 901 on 2026-10-13 and 2026-10-19 (`../part-03/neon-roles.md`). The compute
is set to 0.25 CU as of 2026-10-20; I did not record when it was changed.

## What Neon's docs say (read 2026-10-20)

The docs disagree with each other, so both figures are recorded:

| Compute | [Connection pooling](https://neon.com/docs/connect/connection-pooling) ("Why connection pooling matters") | [Manage computes](https://neon.tech/docs/manage/endpoints) and [compatibility](https://neon.com/docs/reference/compatibility) |
|---|---|---|
| 0.25 CU | 104 | 112 |
| 0.5 CU | 209 | 225 |
| 1 CU | 419 | (formula: 450) |
| 2 CU | 839 | 901 (formula) |

The compatibility page gives the setting as static, derived from the autoscaling range:
`compute_size = min(max_compute_size, 8 * min_compute_size)`, `max_connections = max(100, min(4000, 450.5 * compute_size))`.
For a 0.25 to 2 CU range that is 2 CU and 901, which is the 10-13 and 10-19 reading. For a fixed 0.25 CU it is 112.

## Reading it

- 112 is 7.7 % above the pooling page's 104 for 0.25 CU; 901 is 7.4 % above its 839 for 2 CU. Both readings sit the same
  small distance above that page, and both match the formula page exactly. So the two readings are consistent with each
  other and with the formula, and 112 is what the formula gives for a compute whose maximum is 0.25 CU.
- This shows the maximum is 0.25 CU now (it fell from 901 to 112 after the setting change). It does not show what the
  compute did between 2026-10-13 and the change; Part 3's reports already say that is unknown.
- I am not treating 104 as the value to expect: I could not tell which page is current, and the live value is 112.
  The figure is a record of the compute at the time of the Part 4 runs, not a claim about Neon's documentation.
