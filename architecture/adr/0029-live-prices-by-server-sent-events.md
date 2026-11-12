# ADR-0029: Live prices are server-sent events, one read per instance

## Status

Proposed

## Date

2026-11-12

## Summary

One shared read per instance, pushed to its viewers

## Part

5

## Context

The terminal polled the stored stock prices every five minutes and the leaderboard every minute, and every open screen did it on its own. At the market open that is the polling stampede: each screen is a database read, and the reads
arrive together with the orders. The brief for this part adds a rule that comes from Part 3 and ADR-0013: the market-data service is the only caller of providers and stays inside the shared call budget (`reserveProviderCall`), and
a player never causes a provider call. The prices a screen shows are therefore already stored; the question is only how many times the database is asked for them.

## Decision

A server-sent event route, `/api/prices/stream`, in the Trading App, and a client that falls back to polling.

- **One read per instance per interval, not per viewer.** Each function instance holds one hub (`PriceHub`). It reads the stored prices through the price contract every 5 s while it has at least one client, and pushes the result to all of
  its clients. Reads are coalesced: a client who connects while a read is in flight, or within half an interval of the last one, shares it. The hub makes no read when it has no clients. It never calls a provider, never touches `provider_calls`, and does not import
  the market-data service; a test scans the stream's source for any of them.
- **No LISTEN/NOTIFY.** The pooler runs in transaction mode, where a session cannot hold a `LISTEN`. The clock is the trigger.
- **A connection ends before Hobby's 300 s limit.** Each stream lives between 240 s and 270 s (a jitter, so connections opened together do not end together), sends a `bye` event and closes cleanly. The route declares `maxDuration = 300`, the Hobby cap
  in `cost/allowances.json` (Vercel, Functions limits, read 2026-09-25).
- **Reconnect with backoff, jitter and resume.** The client reconnects after the planned close within 0-2 s, and after a failure with a full-jitter backoff (1 s doubling to 30 s). Every event carries an id (the newest close, the symbol count and the
  stale count); the client sends the last id it holds in `Last-Event-ID` (or `?lastEventId=` when it opens a new connection of its own, which a browser's `EventSource` does not resend), and a client that already holds the current prices is sent a tick instead.
- **Polling is the fallback.** With nothing on screen yet, the first failure polls `/api/stock-prices` at once; with prices on screen, three failures in a row do. Polling runs every 10 s while the stream is retried once a minute, and stops when the stream is back. A browser without
  `EventSource` polls from the start. The price-stream kill switch (ADR-0031) answers 503 `stream-off`, which the client treats as a failure.
- **Three states on screen**, in the design system's own indicator: Live, Reconnecting and Stale. Stale is the price contract's flag for a price older than its kind allows (ADR-0024), or a stream that has been silent for more than three ticks; the client
  does not judge a price's age on its own clock. The indicator also says whether the prices arrive by stream or by polling.

## Consequences

- Database reads for prices are one per instance per 5 s, plus one per polling client every 10 s only while the stream is failing. The report measures reads per second against the number of viewers and against the polling path.
- A viewer holds one open connection (one file descriptor) on an instance for up to 270 s. The limit of 1,024 per instance, minus the database sockets and the runtime's own, is what bounds viewers per instance; the report measures connections per instance.
- A stream is Active CPU only while it writes. Idle connections hold memory but, on Fluid compute, not CPU, so the Hobby allowance of 4 Active CPU-hours is spent by the reads and the writes, not by the waiting; the report measures it rather than assuming it.
- The leaderboard is not streamed: it is a materialized view refreshed on a schedule (ADR-0014), and its once-a-minute poll stays. Whether it survives a stampede is a measurement, not a decision here.
- Prices only change when the market-data service stores a new quote, which for end-of-day stocks is once a trading day. The stream is "live" in the sense that a new close reaches every open screen within 5 s, not that prices tick.

## Alternatives

- **Polling only.** The simplest, and the baseline the stream is measured against: every viewer is a database read per poll. It stays as the fallback. Its cost grows with viewers; the stream's does not.
- **WebSockets.** Vercel documents WebSocket support for Functions, with the connection starting as an HTTP GET with an Upgrade header, and tells clients to expect it to close when the function reaches its maximum duration, so a client reconnects
  with backoff (Vercel, [WebSockets](https://vercel.com/docs/functions/websockets), read 2026-11-12; general availability on 2026-10-20 is from the brief, not from the page I read). A WebSocket is pinned to the one instance that accepted it and is closed at the same duration limit,
  so it needs the same reconnect logic as server-sent events, and it adds a bidirectional channel no screen here needs: prices only flow one way. Not chosen; it would be the answer if players sent anything over the connection.
- **Redis pub/sub.** One publisher, many instance subscribers, no polling of the database by instances. It adds a service, a bill line and a failure mode, and it needs a long-lived subscriber connection in each instance. The database read it would save is one per instance per 5 s.
- **A hosted service (Ably and similar).** Takes the fan-out off the instances entirely. A new vendor with its own terms and a key to keep, for a feed whose data is a few kilobytes a day; `docs/data-sources.md` would need a new entry for it.
- **A Vercel Daemon holding the connections.** A daemon is a long-running process (Vercel, [Daemons](https://vercel.com/docs/daemons), read 2026-11-12) and could hold every viewer's connection. The brief puts the Hobby daemon quota at 5 Active CPU-hours, shared
  with the sweeper (the quota figure is from the brief; the pages I read did not state it), and the sweeper already needs most of it at the open. Not chosen.
- **LISTEN/NOTIFY to push changes.** Not available behind a transaction-mode pooler.

## What would flip it

- A measured instance that cannot hold its share of viewers within the descriptor limit: a daemon or a hosted fan-out would then be the answer.
- Prices that tick (a real-time provider): a push from the writer, not a read on a clock, becomes the right shape, and Redis or a hosted service earns its cost.
- Hobby's duration limit changing: the lifetime constants follow it.

## Links

- ADR-0013 (one market-data owner), ADR-0024 (freshness depends on the price kind), ADR-0014 (the leaderboard as a view), ADR-0030 (separate pools), ADR-0031 (degradation).
- Vercel, [WebSockets on Vercel Functions](https://vercel.com/docs/functions/websockets) and [Daemons](https://vercel.com/docs/daemons), read 2026-11-12. Vercel, [Functions limitations](https://vercel.com/docs/functions/limitations), read 2026-09-25 (in `cost/allowances.json`).
- WHATWG, [Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html): `retry`, `id` and `Last-Event-ID`.
- `post-facts/part-05.md` — reads per second against viewers, connections per instance, and the behaviour at 300 s.
