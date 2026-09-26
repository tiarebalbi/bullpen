"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ConnectionIndicator, ErrorState, PriceCell, TickerBadge, useNow } from "@bullpen/ui";
import type { PriceSnapshot } from "@bullpen/contracts";
import { CoinGeckoCredit } from "./CoinGeckoCredit.js";

// bullpen.js's own sample data (design/export-2026-09-25-final/bullpen.js)
// assigns BTC-USD hue: 65 -- reused here rather than picking a new one, so
// this matches the design's own sample data for the same symbol.
const BTC_HUE = 65;

const POLL_INTERVAL_MS = 60_000;
// "Labeled stale when time is more than 10 minutes old" (Step 4) -- distinct
// from PriceCell's own 15s default staleAfterMs, passed explicitly here.
const STALE_AFTER_MS = 10 * 60 * 1000;

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string; attempt: number }
  | { status: "ok"; snapshot: PriceSnapshot };

export function PriceTicker({ symbol }: { symbol: string }): ReactNode {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function load() {
      attempt += 1;
      try {
        const response = await fetch(`/api/price/${symbol}`);
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) {
            setState({ status: "error", message: body.error ?? "Price unavailable.", attempt });
          }
          return;
        }
        const snapshot = (await response.json()) as PriceSnapshot;
        if (!cancelled) {
          setState({ status: "ok", snapshot });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Price unavailable.", attempt });
        }
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (state.status === "loading") {
    return (
      <div className="bp-price-ticker">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TickerBadge symbol={symbol} kind="crypto" hue={BTC_HUE} />
          <PriceCell symbol={symbol} price={0} changePercent={0} timestamp={0} status="loading" />
        </div>
        <ConnectionIndicator status="reconnecting" detail="connecting" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="bp-price-ticker">
        <ErrorState title="Price unavailable" description={state.message} />
        <ConnectionIndicator status="offline" detail={`attempt ${state.attempt}`} />
      </div>
    );
  }

  const { snapshot } = state;
  const timestamp = new Date(snapshot.time).getTime();
  const isStale = now - timestamp > STALE_AFTER_MS;

  return (
    <div className="bp-price-ticker">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <TickerBadge symbol={snapshot.symbol} kind="crypto" hue={BTC_HUE} />
        <PriceCell
          symbol={snapshot.symbol}
          price={snapshot.price}
          changePercent={snapshot.changePercent}
          timestamp={timestamp}
          staleAfterMs={STALE_AFTER_MS}
        />
      </div>
      <ConnectionIndicator status={isStale ? "stale" : "live"} />
      <CoinGeckoCredit />
    </div>
  );
}
