# What one leaderboard read sends

Date: 2026-10-16. Read from a local `postgres:17-alpine` container, never from Neon (the Neon project is suspended for network
transfer; see `contention.md`).

The leaderboard route used to return every ranked account. It now returns the top 50 rows and, when the caller passes
`?account=<uuid>` and that account ranks lower, the caller's own row, and nothing else. It also says how many accounts are ranked
(`total`), so a page can show "top 50 of N". Tied accounts share a rank; a test-marked account (handle starting `zz-test-`) is left
out of the ranking and takes no place in it.

## Command

```
pnpm --filter @bullpen/fitness-checks test:db -- --reporter=verbose
```

The test is `read-limits.int.test.ts` > "what one read sends". It seeds accounts in the throwaway database, refreshes the view, and
measures the JSON of the rows a read returns.

## Bytes per read, before and after

| | Rows | Bytes (JSON) | Per row |
|---|---|---|---|
| Before: the whole ranking | 2,096 | 359,557 | 172 |
| After: the capped read | 50 | 8,869 | 177 |

About 2.5 percent of the size at 2,096 accounts, and the size no longer grows with the number of players: 50 rows is about 8.9 KB
at 2,000 accounts or 2,000,000. (The route adds a few hundred bytes of envelope: as-of time, age, `total`.)

## Tests

- the read returns at most the cap, and `total` counts everyone ranked;
- asking for more than the cap still returns at most the cap, and asking for fewer returns fewer;
- the caller's row is added once when it ranks below the top, and not twice when it is in the top;
- tied accounts share a rank and the next rank skips the places they take;
- a test-marked account is not in the read, does not shift anyone's rank, and is returned only when asked for;
- a test-sourced quote is not in the prices, and a real one is;
- the route passes the caller's account only when it is a uuid, adds nothing else, and answers 503 without the error text
  (`apps/web/app/api/leaderboard/route.test.ts`).
