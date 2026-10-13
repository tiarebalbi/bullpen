"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ConnectionIndicator, EmptyState, ErrorState, fmt } from "@bullpen/ui";
import type { StockPriceSnapshot } from "@bullpen/contracts";

const POLL_INTERVAL_MS = 5 * 60_000;

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

  if (state.status === "loading") return <section aria-label="Stock prices" className="bp-stock-prices"><ConnectionIndicator status="reconnecting" detail="loading" /></section>;
  if (state.status === "error") {
    return (
      <section aria-label="Stock prices" className="bp-stock-prices">
        <ErrorState title="Stock prices unavailable" description={state.message} />
      </section>
    );
  }

  const { rows } = state.snapshot;
  return (
    <section aria-label="Stock prices" className="bp-stock-prices">
      <h2>U.S. stocks, end of day</h2>
      {rows.length === 0 ? (
        <EmptyState title="No end-of-day prices yet" description="The first prices arrive after the next U.S. market close." />
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col" style={{ textAlign: "right" }}>Close</th>
              <th scope="col">As of</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <td>{row.symbol}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(Number(row.price))}</td>
                <td>{closeLabel(row.asOf)}</td>
                <td>
                  <ConnectionIndicator status={row.stale ? "stale" : "delayed"} detail={row.stale ? "older than its close" : "end of day"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="bp-stock-prices__credit">
        Stock prices: <a href="https://www.alphavantage.co">Alpha Vantage</a>. End of day, not live.
      </p>
    </section>
  );
}
