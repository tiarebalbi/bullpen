"use client";

import type { CSSProperties, ReactNode } from "react";
import { fmt, formatTime, signed } from "../lib/format.js";
import { Skeleton } from "./Skeleton.js";
import { TickerBadge, type TickerBadgeProps } from "./TickerBadge.js";

/**
 * Ported from the "Most traded in the league" tape band in Bullpen
 * Landing.dc.html (~line 93-98): a label on the left over a
 * `--surface-sunken` band, quotes on the right. That tape scrolls several
 * symbols with sample data; this strip shows exactly one real quote (no
 * invented rows), with a required "as of" time and a provider credit,
 * since it's live data from an external source (see ADR-0005 in the case
 * of CoinGecko).
 *
 * Motion: the only animated child is `Skeleton` (loading state), which
 * already respects `prefers-reduced-motion` on its own -- nothing here
 * needs a separate reduced-motion fallback.
 */
export type MarketStripStatus = "loading" | "live" | "stale" | "error";

export interface MarketStripQuote {
  symbol: string;
  kind: TickerBadgeProps["kind"];
  hue: number;
  price: number;
  changePercent: number;
  /** Epoch ms of the upstream tick. */
  timestamp: number;
}

export interface MarketStripProps {
  /** e.g. "Live prices". */
  label: string;
  status: MarketStripStatus;
  /** Required when status is "live" or "stale". */
  quote?: MarketStripQuote;
  /** Required when status is "error". */
  errorMessage?: string;
  creditLabel: string;
  creditHref: string;
  className?: string;
}

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "var(--surface-sunken)",
  overflow: "hidden",
};

const LABEL_STYLE: CSSProperties = {
  flex: "none",
  padding: "16px 20px",
  font: "600 10.5px/1.3 var(--font-body)",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "var(--foreground-muted)",
};

const QUOTE_CELL_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 22px",
  borderLeft: "1px solid var(--bp-hair)",
};

export function MarketStrip({
  label,
  status,
  quote,
  errorMessage,
  creditLabel,
  creditHref,
  className,
}: MarketStripProps): ReactNode {
  return (
    <div className={["bp-market-strip", className].filter(Boolean).join(" ")} style={ROW_STYLE}>
      <div style={LABEL_STYLE}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
        {status === "loading" ? <LoadingCell /> : null}
        {status === "error" ? <ErrorCell message={errorMessage ?? "Price unavailable."} /> : null}
        {(status === "live" || status === "stale") && quote ? (
          <QuoteCell quote={quote} stale={status === "stale"} />
        ) : null}
      </div>
      <a
        href={creditHref}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flex: "none",
          padding: "0 20px",
          font: "600 11px/1.4 var(--font-body)",
          color: "var(--foreground-muted)",
          textDecoration: "none",
        }}
      >
        {creditLabel}
      </a>
    </div>
  );
}

function LoadingCell(): ReactNode {
  return (
    <div style={QUOTE_CELL_STYLE} data-testid="market-strip-loading">
      <Skeleton width={38} height={26} radius={8} />
      <Skeleton width={90} height={14} />
    </div>
  );
}

function ErrorCell({ message }: { message: string }): ReactNode {
  return (
    <div style={QUOTE_CELL_STYLE} role="alert" data-testid="market-strip-error">
      <span style={{ font: "500 13px/1.4 var(--font-body)", color: "var(--foreground-muted)" }}>{message}</span>
    </div>
  );
}

function QuoteCell({ quote, stale }: { quote: MarketStripQuote; stale: boolean }): ReactNode {
  const up = quote.changePercent >= 0;
  return (
    <div style={QUOTE_CELL_STYLE} data-testid="market-strip-quote">
      <TickerBadge symbol={quote.symbol} kind={quote.kind} hue={quote.hue} size="sm" stale={stale} />
      <span
        style={{
          font: "500 14px/1 var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: stale ? "var(--bp-stale)" : "var(--foreground)",
        }}
      >
        {fmt(quote.price)}
      </span>
      <span
        data-testid="market-strip-change"
        style={{ font: "500 12px/1 var(--font-mono)", color: up ? "var(--bp-gain)" : "var(--bp-loss)" }}
      >
        {up ? "▲" : "▼"} {signed(quote.changePercent, 2, "", "%")}
      </span>
      <span
        data-testid="market-strip-time"
        style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--foreground-muted)" }}
      >
        {stale ? "stale · " : ""}as of {formatTime(quote.timestamp)}
      </span>
    </div>
  );
}
