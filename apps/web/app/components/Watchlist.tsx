"use client";

import type { ReactNode } from "react";
import { ConnectionIndicator, EmptyState, ErrorState, Skeleton, WatchlistRow, WatchlistSection, isUsMarketClosed, signed, useNow } from "@bullpen/ui";
import type { ConnectionStatus } from "@bullpen/ui";
import type { PositionView, PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import { changeVsPreviousClose, heldLabel } from "../lib/trading/terminalView.js";
import type { Polled } from "../lib/usePolled.js";
import { CoinGeckoCredit } from "./CoinGeckoCredit.js";
import { Unavailable } from "./Unavailable.js";

// A quiet tint for scanning, never meaning: bullpen.js gives BTC-USD hue 65, and every stock shares one hue so no ticker stands out.
export const BTC_HUE = 65;
export const STOCK_HUE = 235;
export const BTC_SYMBOL = "BTC-USD";
/** "Labeled stale when time is more than 10 minutes old" (the price route's own rule). */
export const BTC_STALE_AFTER_MS = 10 * 60 * 1000;

/** "Oct 13" for the close a price belongs to: a date, because an end-of-day price has no time of day. */
export function closeLabel(asOf: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(asOf));
}

const skeletons = (
  <div style={{ display: "grid", gap: 12 }} aria-hidden="true">
    {[0, 1, 2].map((n) => (
      <Skeleton key={n} width="100%" height={40} />
    ))}
  </div>
);

interface SelectProps {
  selected: string;
  onSelect: (symbol: string) => void;
}

export function StocksSection({ polled, selected, onSelect, positions = [] }: { polled: Polled<StockPriceSnapshot>; positions?: PositionView[] } & SelectProps): ReactNode {
  const now = useNow();
  const closed = isUsMarketClosed(now);
  let body: ReactNode;
  if (polled.status === "loading") body = skeletons;
  else if (polled.status === "error") body = <Unavailable httpStatus={polled.httpStatus} title="Stock prices unavailable" message={polled.message} what="Stock prices" />;
  else if (polled.data.rows.length === 0) body = <EmptyState title="No end-of-day prices yet" description="The first prices arrive after the next U.S. market close." />;
  else {
    body = polled.data.rows.map((row) => {
      const change = changeVsPreviousClose(row);
      const held = heldLabel(positions, row.symbol);
      return (
      <WatchlistRow
        key={row.symbol}
        symbol={row.symbol}
        kind="stock"
        hue={STOCK_HUE}
        detail={held ? `Close · ${closeLabel(row.asOf)} · ${held}` : `Close · ${closeLabel(row.asOf)}`}
        price={Number(row.price)}
        status={row.stale ? `Stale · ${closeLabel(row.asOf)}` : change ? `${change.up ? "▲" : "▼"} ${signed(change.percent, 2, "", "%")}` : undefined}
        stale={row.stale}
        marketClosed={closed}
        selected={selected === row.symbol}
        onSelect={onSelect}
      />
      );
    });
  }
  return (
    <WatchlistSection title="Stocks" note="end of day">
      {body}
      {polled.status === "ok" && polled.data.rows.length > 0 ? (
        <p className="bp-credit">
          Stock prices: <a href="https://www.alphavantage.co">Alpha Vantage</a>. End of day, not live.
        </p>
      ) : null}
    </WatchlistSection>
  );
}

export function CryptoSection({ polled, selected, onSelect }: { polled: Polled<PriceSnapshot> } & SelectProps): ReactNode {
  const now = useNow();
  let body: ReactNode;
  if (polled.status === "loading") body = skeletons;
  // The live price does not come from the database, so a failure here is the provider's, never "database unavailable".
  else if (polled.status === "error") body = <ErrorState title="Price unavailable" description={polled.message} />;
  else {
    const { data } = polled;
    const stale = now - new Date(data.time).getTime() > BTC_STALE_AFTER_MS;
    body = (
      <WatchlistRow
        symbol={data.symbol}
        kind="crypto"
        hue={BTC_HUE}
        detail={stale ? "Stale" : "Live"}
        price={data.price}
        status={stale ? "Stale" : `${data.changePercent >= 0 ? "▲" : "▼"} ${signed(data.changePercent, 2, "", "%")}`}
        stale={stale}
        selected={selected === data.symbol}
        onSelect={onSelect}
      />
    );
  }
  return (
    <WatchlistSection title="Crypto" note="live">
      {body}
      {polled.status === "ok" ? <CoinGeckoCredit /> : null}
    </WatchlistSection>
  );
}

/** Whether the live price is current: still loading, failed, older than ten minutes, or fresh. */
function cryptoState(crypto: Polled<PriceSnapshot>, now: number): ConnectionStatus {
  if (crypto.status === "loading") return "reconnecting";
  if (crypto.status === "error") return "offline";
  return now - new Date(crypto.data.time).getTime() > BTC_STALE_AFTER_MS ? "stale" : "live";
}

/** The watchlist's own status in the header: whether the crypto price is live, and whether stocks are shown at their close. */
export function MarketStatus({ crypto }: { crypto: Polled<PriceSnapshot> }): ReactNode {
  const now = useNow();
  return (
    <>
      <span className="bp-terminal__chip">Stocks · end of day</span>
      <ConnectionIndicator status={cryptoState(crypto, now)} detail="crypto" />
    </>
  );
}
