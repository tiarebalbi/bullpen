"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MarketStrip, type MarketStripStatus } from "./ui.js";
import { BULLPEN_WEB_URL } from "../lib/webAppUrl.js";

/**
 * Ported from the "Most traded in the league" tape band (Bullpen
 * Landing.dc.html ~line 93-98), relabeled "Live prices" and showing one
 * real quote (BTC-USD) instead of the design's sample multi-symbol tape --
 * there's no league yet, so no league trading data exists to show. Other
 * symbols arrive with Part 3 (the tape becomes real then).
 *
 * Fetches apps/web's own price route directly (cross-origin, not a
 * package import -- doesn't touch turbo boundaries' "apps never depend on
 * apps" rule, which is a build-time package-dependency check). That route
 * needs CORS enabled for this origin; see apps/web's route.ts.
 */
const POLL_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 10 * 60 * 1000;
const BTC_HUE = 65; // bullpen.js's own sample data for BTC-USD.

interface PriceSnapshot {
  symbol: string;
  price: number;
  changePercent: number;
  time: string;
  source: string;
  fetchedAt: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; snapshot: PriceSnapshot };

export function MarketStripSection(): ReactNode {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${BULLPEN_WEB_URL}/api/price/BTC-USD`);
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setState({ status: "error", message: body.error ?? "Price unavailable." });
          return;
        }
        const snapshot = (await response.json()) as PriceSnapshot;
        if (!cancelled) setState({ status: "ok", snapshot });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Price unavailable." });
      }
    }

    load();
    const loadId = setInterval(load, POLL_INTERVAL_MS);
    const clockId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(loadId);
      clearInterval(clockId);
    };
  }, []);

  const credit = { creditLabel: "Powered by CoinGecko", creditHref: "https://www.coingecko.com/en/api" };

  if (state.status === "loading") {
    return <MarketStrip label="Live prices" status="loading" {...credit} />;
  }

  if (state.status === "error") {
    return <MarketStrip label="Live prices" status="error" errorMessage={state.message} {...credit} />;
  }

  const { snapshot } = state;
  const timestamp = new Date(snapshot.time).getTime();
  const status: MarketStripStatus = now - timestamp > STALE_AFTER_MS ? "stale" : "live";

  return (
    <MarketStrip
      label="Live prices"
      status={status}
      quote={{
        symbol: snapshot.symbol,
        kind: "crypto",
        hue: BTC_HUE,
        price: snapshot.price,
        changePercent: snapshot.changePercent,
        timestamp,
      }}
      {...credit}
    />
  );
}
