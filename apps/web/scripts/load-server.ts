/**
 * The stand-in Trading App a local load run drives. It is not Next.js and it has no sign-in: a request names its account in the `x-account` header. What it does
 * share with the deployed app is everything below the route handlers: the order pool and the read pool exactly as the routes make them (apps/web/app/lib/trading),
 * the lifecycle, the sweep, the price hub and stream, the leaderboard read and the moderation path. So a run measures the application's capacity under the
 * constraints it is given, and says nothing about Next.js, the sign-in or Vercel's own limits. The report says so wherever it quotes a number from here.
 *
 *   (started by architecture/fitness/src/load/run.ts, which builds the database and passes the URLs in the environment)
 *   tsx scripts/load-server.ts [port]
 *
 * Local only: it binds to 127.0.0.1, and refuses a database that is not on this machine. It reaches only the trading schema. Everything that touches market-data (the quotes,
 * the provider budget) is done by the run itself, since the Trading App may not depend on market-data (structure.adl).
 */
import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { readdirSync } from "node:fs";
import { Readable } from "node:stream";
import { advanceAccount, cancelPlayerOrder, createPool, createSimulatedVenue, placePlayerOrder, readAccountView, readPrices, serveLeaderboard, tick, BuyRefused } from "@bullpen/db-trading";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
const databaseUrl = process.env.LOAD_DB_URL ?? "";
if (!databaseUrl || !LOCAL.has(new URL(databaseUrl).hostname)) {
  console.error("refusing to start: LOAD_DB_URL must name a database on this machine");
  process.exit(1);
}

// The app's own modules, imported after the environment is set: the same pools, hub and stream the routes use.
const { orderPool } = await import("../app/lib/trading/orders/pool.js");
const { readPool } = await import("../app/lib/trading/reads/pool.js");
const { priceHub } = await import("../app/lib/trading/reads/hub.js");
const { openPriceStream } = await import("../app/lib/trading/reads/priceStream.js");
const { isOff } = await import("../app/lib/degradation/switches.js");
const { setSwitches, currentSwitches } = await import("../app/lib/degradation/testing.js");
const { saveAndModerate } = await import("../app/lib/moderation/moderate.js");
const { TIMEOUT_MS } = await import("../app/lib/moderation/config.js");

/** POOLS=shared is the control for the isolation measurement: one pool of ten connections serves both the order path and the reads, as every route did before Part 5. */
const sharedPool = process.env.POOLS === "shared" ? createPool(databaseUrl, { max: 10, applicationName: "bullpen-shared", connectionTimeoutMillis: 5000 }) : null;
const ordersPool = (): ReturnType<typeof createPool> => sharedPool ?? orderPool();
const readsPool = (): ReturnType<typeof createPool> => sharedPool ?? readPool();

const SATURDAY = new Date("2026-11-14T15:00:00Z");
const state = { opensAt: null as number | null, openedAt: null as number | null, market: "open" as "open" | "closed", moderation: "ok" as "ok" | "slow" | "down", sseLifetimeMs: undefined as number | undefined };
const counts = { requests: 0, sseOpened: 0, sseClosed: 0, refused: 0 };
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** A handle store that holds nothing: the moderation path under test is the ask, not the handles database. */
const memoryStore = { submit: async () => ({ ok: true as const, handleId: "h" }), record: async () => true };
const ask = async (): Promise<{ ok: true; probability: number; costUsd: number; latencyMs: number } | { ok: false; reason: "timeout"; latencyMs: number }> => {
  if (state.moderation === "ok") {
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true, probability: 0.99, costUsd: 0, latencyMs: 20 };
  }
  if (state.moderation === "slow") {
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true, probability: 0.99, costUsd: 0, latencyMs: 1500 };
  }
  await new Promise((r) => setTimeout(r, TIMEOUT_MS)); // a provider that does not answer: the request gives up at the timeout, as askGateway does
  return { ok: false, reason: "timeout", latencyMs: TIMEOUT_MS };
};

/** Open now, or opening at the instant a run scheduled (so the sweeper, which sleeps until the open the route names, wakes for it as it would at 9:30). */
const marketIsOpen = (): boolean => state.market === "open" || (state.opensAt !== null && Date.now() >= state.opensAt);

const poolStats = (pool: ReturnType<typeof createPool>) => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });

async function stats(): Promise<unknown> {
  const hub = priceHub();
  const [queued, byState, appNames, dbXacts] = await Promise.all([
    readPool().query<{ n: string }>("SELECT count(*)::text AS n FROM trading.orders WHERE status = 'queued_for_open'"),
    readPool().query<{ status: string; n: string }>("SELECT status, count(*)::text AS n FROM trading.orders GROUP BY status"),
    readPool().query<{ application_name: string; n: string }>("SELECT application_name, count(*)::text AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1"),
    readPool().query<{ xacts: string; fetched: string; returned: string }>("SELECT (xact_commit + xact_rollback)::text AS xacts, tup_fetched::text AS fetched, tup_returned::text AS returned FROM pg_stat_database WHERE datname = current_database()"),
  ]).catch(() => [null, null, null, null] as const);
  return {
    at: Date.now(),
    counts,
    pools: sharedPool ? { shared: poolStats(sharedPool), orders: poolStats(orderPool()), reads: poolStats(readPool()) } : { orders: poolStats(orderPool()), reads: poolStats(readPool()) },
    hub: { reads: hub.reads, readFailures: hub.readFailures, clients: hub.clients, peakClients: hub.peakClients },
    eventLoopP99Ms: loop.percentile(99) / 1e6,
    eventLoopMaxMs: loop.max / 1e6,
    fds: readdirSync("/proc/self/fd").length,
    dbXacts: dbXacts ? { xacts: Number(dbXacts.rows[0]!.xacts), tupFetched: Number(dbXacts.rows[0]!.fetched), tupReturned: Number(dbXacts.rows[0]!.returned) } : null,
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    cpuMs: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000),
    queued: queued ? Number(queued.rows[0]!.n) : null,
    orderStates: byState ? Object.fromEntries(byState.rows.map((r) => [r.status, Number(r.n)])) : null,
    connectionsByApp: appNames ? Object.fromEntries(appNames.rows.map((r) => [r.application_name || "(none)", Number(r.n)])) : null,
    controls: { openedAt: state.openedAt, opensAt: state.opensAt, market: state.market, moderation: state.moderation, off: currentSwitches() },
  };
}

async function control(body: Record<string, unknown>): Promise<unknown> {
  const done: Record<string, unknown> = {};
  if (typeof body.opensAt === "number") {
    state.market = "closed";
    state.opensAt = body.opensAt;
    state.openedAt = body.opensAt;
  }
  if (body.market === "open" || body.market === "closed") {
    state.market = body.market;
    state.openedAt = body.market === "open" ? Date.now() : null;
  }
  if (body.moderation === "ok" || body.moderation === "slow" || body.moderation === "down") state.moderation = body.moderation;
  if (typeof body.off === "string") setSwitches(body.off || undefined);
  if (typeof body.sseLifetimeMs === "number") state.sseLifetimeMs = body.sseLifetimeMs || undefined;
  return done;
}

const server = http.createServer(async (req, res) => {
  counts.requests += 1;
  const url = new URL(req.url ?? "/", "http://x");
  const account = String(req.headers["x-account"] ?? "");
  try {
    if (url.pathname === "/__stats") return json(res, 200, await stats());
    if (url.pathname === "/__control" && req.method === "POST") return json(res, 200, await control(await readBody(req)));
    if (url.pathname === "/__health") return json(res, 200, { ok: true });

    if (url.pathname === "/api/internal/sweep" && req.method === "POST") {
      if (req.headers.authorization !== "Bearer load") return json(res, 401, { error: "Unauthorized." });
      const pool = ordersPool();
      const reply = await tick(pool, createSimulatedVenue(pool), new Date(), {}, { isOpen: () => marketIsOpen() });
      // A run that scheduled an open names it, as the real route names 9:30 ET: the sweeper never sleeps past it.
      return json(res, 200, state.opensAt !== null && state.opensAt > Date.now() ? { ...reply, nextOpen: new Date(state.opensAt).toISOString() } : reply);
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const pool = ordersPool();
        const closed = !marketIsOpen();
        const placed = await placePlayerOrder(pool, account, { symbol: String(body.symbol), quantity: String(body.quantity), clientOrderId: String(body.clientOrderId) }, closed ? SATURDAY : new Date(), { queueUntilOpen: closed });
        return json(res, placed.duplicate ? 200 : 201, { orderId: placed.orderId, duplicate: placed.duplicate, account: await readAccountView(pool, account) });
      } catch (error) {
        if (error instanceof BuyRefused) {
          counts.refused += 1;
          return json(res, 422, { error: "refused", reason: error.reason });
        }
        return json(res, 503, { error: "unavailable" });
      }
    }
    if (url.pathname === "/api/orders" && req.method === "GET") {
      try {
        const pool = readsPool();
        await advanceAccount(pool, account);
        return json(res, 200, await readAccountView(pool, account));
      } catch {
        return json(res, 503, { error: "unavailable" });
      }
    }
    if (/^\/api\/orders\/[^/]+\/cancel$/.test(url.pathname) && req.method === "POST") {
      try {
        const outcome = await cancelPlayerOrder(ordersPool(), account, url.pathname.split("/")[3]!);
        return json(res, outcome === "cancelled" ? 200 : 202, { outcome });
      } catch {
        return json(res, 503, { error: "unavailable" });
      }
    }
    if (url.pathname === "/api/stock-prices") {
      try {
        const prices = await readPrices(readsPool());
        return json(res, 200, { rows: prices.map((p) => ({ symbol: p.symbol, price: p.price, asOf: p.asOf.toISOString(), stale: p.stale, previousClose: null })) });
      } catch {
        return json(res, 503, { error: "Stock prices unavailable." });
      }
    }
    if (url.pathname === "/api/leaderboard") {
      try {
        const read = await serveLeaderboard(readsPool(), { schedule: isOff("leaderboard-refresh") ? () => undefined : (work) => void setImmediate(() => void Promise.resolve(work()).catch(() => undefined)), read: {} });
        return json(res, 200, { rows: read.rows, total: read.total, asOf: read.asOf.toISOString(), ageMs: read.ageMs, stale: read.stale });
      } catch {
        return json(res, 503, { error: "Leaderboard unavailable." });
      }
    }
    if (url.pathname === "/api/handle" && req.method === "POST") {
      const outcome = await saveAndModerate(account, String((await readBody(req)).handle ?? ""), { store: memoryStore, ask, log: () => undefined });
      return json(res, outcome.ok ? 200 : 400, outcome);
    }
    if (url.pathname === "/api/prices/stream") {
      if (isOff("price-stream")) {
        res.writeHead(503, { "content-type": "application/json", "x-bullpen-stream": "off" });
        return void res.end(JSON.stringify({ error: "stream-off" }));
      }
      const abort = new AbortController();
      const lastEventId = String(req.headers["last-event-id"] ?? url.searchParams.get("lastEventId") ?? "") || undefined;
      const body = openPriceStream(priceHub(), { lastEventId, signal: abort.signal, lifetimeMs: Number(url.searchParams.get("lifetime")) || state.sseLifetimeMs });
      counts.sseOpened += 1;
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform" });
      const readable = Readable.fromWeb(body as never);
      readable.pipe(res);
      res.on("close", () => {
        counts.sseClosed += 1;
        abort.abort();
        readable.destroy();
      });
      return;
    }
    json(res, 404, { error: "not-found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "error" });
  }
});

const port = Number(process.argv[2] ?? 3100);
server.keepAliveTimeout = 65_000;
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ listening: port })));
const stop = (): void => {
  server.close();
  void Promise.all([orderPool().end(), readPool().end(), sharedPool?.end()]).finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
