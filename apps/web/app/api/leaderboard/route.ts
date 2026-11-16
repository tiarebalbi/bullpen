import { after, NextResponse } from "next/server";
import { serveLeaderboard } from "@bullpen/db-trading";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import { isOff } from "../../lib/degradation/switches.js";
import { readViewer } from "../../lib/handles/viewer.js";
import { readPool } from "../../lib/trading/reads/pool.js";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The leaderboard: the top of the current ranking, never the whole of it, with its as-of time. It never waits
 * for a refresh. If the ranking is older than 5 minutes, the refresh starts
 * after the response is sent, under a lock that lets only one run. A failed
 * refresh leaves the last good ranking, and `lastFailure` says so.
 * With the leaderboard-refresh switch off (ADR-0031) no refresh is ever scheduled: the last good ranking is served, as old as it is, and says so by its age.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    // The caller's own account, if the page knows it: its row is added when it is not in the top. Anything but a uuid is ignored.
    const account = new URL(request.url).searchParams.get("account");
    const named = account !== null && UUID.test(account) ? account : undefined;
    // The signed-in caller, from their session and not from the request: their own row is added when it is not in the top, and the page marks it.
    const viewer = await readViewer();
    const read = await serveLeaderboard(readPool(), { schedule: isOff("leaderboard-refresh") ? () => undefined : (work) => after(work), read: { accountId: viewer?.accountId ?? named } });
    const body: LeaderboardSnapshot = {
      rows: read.rows,
      total: read.total,
      asOf: read.asOf.toISOString(),
      ageMs: read.ageMs,
      stale: read.stale,
      lastFailure: read.lastFailure ? { at: read.lastFailure.at.toISOString(), error: read.lastFailure.error } : null,
      ...(viewer ? { viewer } : {}),
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Leaderboard unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
