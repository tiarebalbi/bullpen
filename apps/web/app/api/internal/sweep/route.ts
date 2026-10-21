import { NextResponse } from "next/server";
import { DerivedVenue, dbPriceSource, tick } from "@bullpen/db-trading";
import type { SweepTick } from "@bullpen/contracts";
import { authorizeSweep } from "../../../lib/trading/sweepAuth.js";
import { tradingPool } from "../../../lib/trading/pool.js";

export const dynamic = "force-dynamic";

/** The simulator's seed: a run of fills is reproducible from it. */
const SIMULATOR_SEED = 20261026;

/**
 * One pass of the order lifecycle's background work (ADR-0018): deliver what the venue has, then find what is stuck.
 * Called by the sweeper with a bearer token. It is idempotent, so a call that dies and is repeated changes nothing twice.
 * The reply says how many orders are still open, which is what lets the caller back off when there are none.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeSweep(request);
  if (auth === "not-configured") return NextResponse.json({ error: "The sweep is not configured." }, { status: 503, headers: { "cache-control": "no-store" } });
  if (auth !== "ok") return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const pool = tradingPool();
    const result: SweepTick = await tick(pool, new DerivedVenue(pool, { seed: SIMULATOR_SEED, prices: dbPriceSource(pool) }), new Date());
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The sweep failed." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
