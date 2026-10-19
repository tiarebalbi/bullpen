"use client";

import type { ReactNode } from "react";
import { EmptyState, Panel, PriceCell, TickerBadge, isUsMarketClosed, useNow } from "@bullpen/ui";
import type { PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import type { Polled } from "../lib/usePolled.js";
import { CoinGeckoCredit } from "./CoinGeckoCredit.js";
import { BTC_HUE, BTC_STALE_AFTER_MS, BTC_SYMBOL, STOCK_HUE, closeLabel } from "./Watchlist.js";

/**
 * The main panel's top: the selected symbol and its price in the state it is in. The design draws a chart here; the database holds
 * a single end-of-day close per stock and no crypto history, so it says that instead of drawing a line through one point.
 */
export function SymbolDetail({ selected, crypto, stocks }: { selected: string; crypto: Polled<PriceSnapshot>; stocks: Polled<StockPriceSnapshot> }): ReactNode {
  const now = useNow();
  const closed = isUsMarketClosed(now);

  if (selected === BTC_SYMBOL) {
    if (crypto.status !== "ok") return <Panel title="BTC-USD" label="Price detail"><p className="bp-detail__note">{crypto.status === "loading" ? "Reading the live price…" : "The live price is unavailable, so there is nothing to show here."}</p></Panel>;
    const { data } = crypto;
    const timestamp = new Date(data.time).getTime();
    return (
      <Panel title="BTC-USD" label="Price detail">
        <div className="bp-detail">
          <TickerBadge symbol={data.symbol} kind="crypto" hue={BTC_HUE} size="lg" />
          <PriceCell symbol={data.symbol} price={data.price} changePercent={data.changePercent} timestamp={timestamp} staleAfterMs={BTC_STALE_AFTER_MS} />
        </div>
        <CoinGeckoCredit />
        <NoHistory />
      </Panel>
    );
  }

  const row = stocks.status === "ok" ? stocks.data.rows.find((r) => r.symbol === selected) : undefined;
  if (!row) return <Panel title={selected} label="Price detail"><p className="bp-detail__note">That price is not available right now.</p></Panel>;
  return (
    <Panel title={row.symbol} label="Price detail">
      <div className="bp-detail">
        <TickerBadge symbol={row.symbol} kind="stock" hue={STOCK_HUE} size="lg" stale={row.stale} marketClosed={closed} />
        <PriceCell symbol={row.symbol} price={Number(row.price)} changePercent={0} timestamp={new Date(row.asOf).getTime()} status="market-closed" statusLabel="Close · 16:00 ET" stale={row.stale} asOfLabel={closeLabel(row.asOf)} />
      </div>
      <p className="bp-detail__note">
        End-of-day price for {closeLabel(row.asOf)}, not live. Stock prices: <a href="https://www.alphavantage.co">Alpha Vantage</a>.
      </p>
      <NoHistory />
    </Panel>
  );
}

function NoHistory(): ReactNode {
  return <EmptyState title="No price history yet" description="A chart needs a history of prices, and the database does not hold one yet." />;
}
