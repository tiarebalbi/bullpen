import { NextResponse } from "next/server";
import { readPrices } from "@bullpen/db-trading";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import { toStockPriceSnapshot } from "../../lib/trading/reads/snapshot.js";
import { readPool } from "../../lib/trading/reads/pool.js";

export const dynamic = "force-dynamic";

/** The latest end-of-day price of every symbol, read through the price contract, with each one's as-of time and stale flag. */
export async function GET(): Promise<NextResponse> {
  try {
    const prices = await readPrices(readPool());
    const body: StockPriceSnapshot = toStockPriceSnapshot(prices);
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Stock prices unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
