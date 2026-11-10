# Bullpen

A paper-trading league: play money, crypto at live prices, US stocks at
end-of-day prices, a live leaderboard. Built in public as the working example for the blog
series **Architecting Software in 2026**.

This repository is built incrementally, one part of the series per week. See
`architecture/adr/` for the decisions behind each step, and `architecture/calm/`
for how the system's shape changes over time.

## Status

- Part 1 — Why distribute at all — published 2026-10-04. Code: tag `post-01`.
- Part 2 — Architecture as code — published 2026-10-11. Code: branch
  `post-02-architecture-as-code`, tag `post-02`.
- Part 3 — Who owns the data — published 2026-10-19. Code: branch `post-03-data`, tag `post-03`.
- Part 4 — The order saga — published 2026-10-26. Orders, sign-in with GitHub and the sweeper are live in the
  trading app at https://bullpen-app.tiarebalbi.com.
- Bonus — Changing the plan mid-flight — published 2026-11-11. Player handles, moderated: a signed-in
  player can choose a handle, which shows on the leaderboard once a decision model or a person approves it
  (ADR-0027).
- Part 5 — The market open and the bill — next, planned for 2026-11-23.
- Part 6 — What held, what broke — planned for 2026-11-30.

`architecture/calm/planned/` is the current plan; the week-one predictions are
kept at the tag `predictions-week-1`.
