"use client";

import type { ReactNode } from "react";
import { TickerBadge } from "./TickerBadge.js";

/**
 * A section of the watchlist ("STOCKS", "CRYPTO") and its rows, from the terminal frame. A row is the symbol's chip, the symbol and a
 * line of what its price is, the price in tabular figures, and a line saying what state it is in. No sparkline: that needs a history
 * the database does not hold yet.
 */
export interface WatchlistSectionProps {
  title: string;
  /** Right of the title: how fresh the section is, e.g. "end of day". */
  note?: string;
  children: ReactNode;
}

export function WatchlistSection({ title, note, children }: WatchlistSectionProps): ReactNode {
  return (
    <section className="bp-watchlist__section" aria-label={title}>
      <div className="bp-watchlist__title">
        <span>{title}</span>
        {note ? <span>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export interface WatchlistRowProps {
  symbol: string;
  kind: "stock" | "crypto";
  hue: number;
  /** Under the symbol: what the price is, e.g. "Close · Oct 15". */
  detail: string;
  price: number;
  /** Under the price: its state in words, e.g. "stale · as of Oct 8" or "▲ +1.25%". */
  status?: string;
  /** The status draws attention (stale): the words carry it, and the row dims the price too. */
  stale?: boolean;
  marketClosed?: boolean;
  selected: boolean;
  onSelect: (symbol: string) => void;
}

export function WatchlistRow(props: WatchlistRowProps): ReactNode {
  const { symbol, kind, hue, detail, price, status, stale = false, marketClosed = false, selected, onSelect } = props;
  // No aria-label: the name is the row's own words, so what is read is what is shown (WCAG 2.5.3, label in name).
  return (
    <button type="button" className="bp-watchlist__row" aria-pressed={selected} onClick={() => onSelect(symbol)}>
      <TickerBadge symbol={symbol} kind={kind} hue={hue} size="md" stale={stale} marketClosed={marketClosed} />
      <span className="bp-watchlist__who">
        <span className="bp-watchlist__symbol">{symbol.replace("-USD", "")}</span>
        <span className="bp-watchlist__detail">{detail}</span>
      </span>
      <span className="bp-watchlist__what">
        <span className="bp-watchlist__price" data-stale={stale || undefined}>
          {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        {status ? <span className="bp-watchlist__status">{status}</span> : null}
      </span>
    </button>
  );
}
