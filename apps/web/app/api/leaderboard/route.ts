import { after, NextResponse } from "next/server";
import { serveLeaderboard } from "@bullpen/db-trading";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import { tradingPool } from "../../lib/trading/pool.js";

export const dynamic = "force-dynamic";

/**
 * The leaderboard: the current ranking with its as-of time. It never waits
 * for a refresh. If the ranking is older than 5 minutes, the refresh starts
 * after the response is sent, under a lock that lets only one run. A failed
 * refresh leaves the last good ranking, and `lastFailure` says so.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const read = await serveLeaderboard(tradingPool(), { schedule: (work) => after(work) });
    const body: LeaderboardSnapshot = {
      rows: read.rows,
      asOf: read.asOf.toISOString(),
      ageMs: read.ageMs,
      stale: read.stale,
      lastFailure: read.lastFailure ? { at: read.lastFailure.at.toISOString(), error: read.lastFailure.error } : null,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Leaderboard unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
