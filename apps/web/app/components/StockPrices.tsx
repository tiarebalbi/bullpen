"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ConnectionIndicator, EmptyState, ErrorState, Panel, PriceCell, Skeleton, TickerBadge, isUsMarketClosed, useNow } from "@bullpen/ui";
import type { StockPriceSnapshot } from "@bullpen/contracts";

const POLL_INTERVAL_MS = 5 * 60_000;
// A quiet tint for scanning, never meaning: the same hue for every stock, so no ticker is made to stand out.
const STOCK_HUE = 235;

type FetchState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; snapshot: StockPriceSnapshot };

/** "Oct 13" for the close a price belongs to: a date, because an end-of-day price has no time of day. */
export function closeLabel(asOf: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(asOf));
}

export function StockPrices(): ReactNode {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/stock-prices");
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setState({ status: "error", message: body.error ?? "Stock prices unavailable." });
          return;
        }
        const snapshot = (await response.json()) as StockPriceSnapshot;
        if (!cancelled) setState({ status: "ok", snapshot });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Stock prices unavailable." });
      }
    }
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <Panel title="U.S. stocks, end of day" label="Stock prices" aside={<ConnectionIndicator status="reconnecting" detail="loading" />}>
        <div style={{ display: "grid", gap: 14 }} aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} width="100%" height={40} />
          ))}
        </div>
      </Panel>
    );
  }
  if (state.status === "error") {
    return (
      <Panel title="U.S. stocks, end of day" label="Stock prices">
        <ErrorState title="Stock prices unavailable" description={state.message} />
      </Panel>
    );
  }

  return <StockList rows={state.snapshot.rows} />;
}

function StockList({ rows }: { rows: StockPriceSnapshot["rows"] }): ReactNode {
  const now = useNow();
  const closed = isUsMarketClosed(now);
  return (
    <Panel title="U.S. stocks, end of day" label="Stock prices" aside={closed ? <span className="bp-stock-prices__closed">Market closed</span> : undefined}>
      {rows.length === 0 ? (
        <EmptyState title="No end-of-day prices yet" description="The first prices arrive after the next U.S. market close." />
      ) : (
        <ul className="bp-stock-list">
          {rows.map((row) => (
            <li key={row.symbol} className="bp-stock-row">
              <TickerBadge symbol={row.symbol} kind="stock" hue={STOCK_HUE} size="md" stale={row.stale} marketClosed={closed} />
              <span>
                <span className="bp-stock-row__name">{row.symbol}</span>
                <span className="bp-stock-row__note">{row.stale ? "older than its close" : "end of day"}</span>
              </span>
              <PriceCell
                symbol={row.symbol}
                price={Number(row.price)}
                changePercent={0}
                timestamp={new Date(row.asOf).getTime()}
                status="market-closed"
                statusLabel="Close · 16:00 ET"
                stale={row.stale}
                asOfLabel={closeLabel(row.asOf)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="bp-stock-prices__credit">
        Stock prices: <a href="https://www.alphavantage.co">Alpha Vantage</a>. End of day, not live.
      </p>
    </Panel>
  );
}
