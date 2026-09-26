"use client";

import type { CSSProperties, ReactNode } from "react";
import { badgeBg, mono } from "../lib/format.js";

/**
 * "Monogram only, never a company logo. Stocks are rounded squares;
 * crypto are pills. Hue is a quiet tint for scanning, never meaning."
 * — Bullpen Design System.dc.html, TickerBadge section.
 */
export type TickerBadgeSize = "sm" | "md" | "lg";

export interface TickerBadgeProps {
  /** Full symbol, e.g. "NVDA" or "BTC-USD" — rendered via mono() as "NVDA"/"BTC". */
  symbol: string;
  kind: "stock" | "crypto";
  /** 0-360 hue used only as a quiet background tint. */
  hue: number;
  size?: TickerBadgeSize;
  /** Dashed border + muted color, matching the "stale" cell in the export. */
  stale?: boolean;
  /** Small moon-glyph badge in the corner, for "market closed". */
  marketClosed?: boolean;
  className?: string;
}

const SIZE: Record<TickerBadgeSize, { minWidth: number; height: number; font: string; padding: string }> = {
  sm: { minWidth: 34, height: 26, font: "600 9.5px/1 var(--font-mono)", padding: "0 6px" },
  md: { minWidth: 44, height: 36, font: "600 11px/1 var(--font-mono)", padding: "0 8px" },
  lg: { minWidth: 54, height: 48, font: "600 13px/1 var(--font-mono)", padding: "0 10px" },
};

export function TickerBadge({ symbol, kind, hue, size = "md", stale, marketClosed, className }: TickerBadgeProps): ReactNode {
  const s = SIZE[size];
  const radius = kind === "crypto" ? "9999px" : "8px";

  const style: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: s.minWidth,
    height: s.height,
    padding: s.padding,
    borderRadius: radius,
    font: s.font,
    letterSpacing: "0.02em",
    background: stale ? "var(--bp-panel-2)" : badgeBg(hue),
    color: stale ? "var(--bp-stale)" : "var(--foreground)",
    border: stale ? "1px dashed var(--foreground-muted)" : "0",
  };

  return (
    <span className={["bp-ticker-badge", className].filter(Boolean).join(" ")} style={style} title={symbol}>
      {mono(symbol)}
      {marketClosed ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -5,
            top: -5,
            width: 16,
            height: 16,
            borderRadius: "9999px",
            background: "var(--bp-panel-2)",
            border: "1px solid var(--bp-hair)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}
