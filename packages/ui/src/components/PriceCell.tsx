"use client";

import type { CSSProperties, ReactNode } from "react";
import { formatTime, signed, fmt } from "../lib/format.js";
import { useReducedMotion } from "../lib/useReducedMotion.js";
import { useNow } from "../lib/useNow.js";
import { usePriceCellTicker, type FlashDirection } from "../lib/usePriceCellTicker.js";
import { Skeleton } from "./Skeleton.js";

/**
 * PriceCell — the "1a Pulse fill" tick treatment (the variant the
 * landing page actually uses, via `data-fa`): the whole cell tints
 * gain/loss and decays over `--bp-dur-tick` (400ms). From
 * Bullpen Design System.dc.html (~line 223, 226-236) and the flash
 * handler in Bullpen Landing.dc.html's `onTick()`:
 *
 *   if (now - (this.wm.get(el) || 0) < 500) return; this.wm.set(el, now);
 *   el.style.background = `color-mix(in oklch, ${tone} 22%, transparent)`;
 *   el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'linear' });
 *
 * That 500ms guard is the "≤2 flashes/second/cell" cap from the
 * CATALOG entry ('PriceTick', … '400ms · ≤2/s/cell', …); it lives in
 * `usePriceCellTicker`, alongside the ≤1/5s polite screen-reader
 * summary the same section calls for.
 *
 * The export's own CATALOG marks PriceTick "Kept: it is already
 * opacity only" under reduced motion — i.e. the source never disables
 * this particular flash. Part 1's brief explicitly asks PriceCell to
 * respect `prefers-reduced-motion: reduce` regardless, so this
 * component suppresses the flash (not the price/label update itself)
 * when reduced motion is on. That is a deliberate deviation from the
 * export's own spec, made to satisfy that explicit accessibility
 * requirement — flagged here rather than silently changed.
 *
 * Staleness: "Marks a quote stale after 15 s without a tick" (Prices
 * service, bullpen.js companion doc). The stale label always shows
 * the visible wall-clock timestamp the design uses ("as of 14:02:11"),
 * not just a color change, so it doesn't rely on color alone either.
 */
export type PriceCellStatus = "live" | "loading" | "market-closed" | "reconnecting";

const STALE_AFTER_MS_DEFAULT = 15_000;

export interface PriceCellProps {
  /** Ticker shown in the polite screen-reader summary, e.g. "NVDA". */
  symbol: string;
  price: number;
  /** Signed percent change, e.g. 2.52 or -2.42. */
  changePercent: number;
  /** Epoch ms of the last tick backing `price`. */
  timestamp: number;
  status?: PriceCellStatus;
  /** Copy shown next to the glyph for "market-closed" (e.g. "Close · 16:00 ET") or "reconnecting" (e.g. "attempt 2 of 5"). */
  statusLabel?: string;
  /**
   * Inject a fixed "now" for deterministic tests. When omitted the
   * component reads `Date.now()` and re-checks staleness once a
   * second on its own.
   */
  now?: number;
  staleAfterMs?: number;
  decimals?: number;
  className?: string;
}

export function PriceCell({
  symbol,
  price,
  changePercent,
  timestamp,
  status = "live",
  statusLabel,
  now: nowProp,
  staleAfterMs = STALE_AFTER_MS_DEFAULT,
  decimals = 2,
  className,
}: PriceCellProps): ReactNode {
  const reduced = useReducedMotion();
  const now = useNow(nowProp);
  const { flash, announce } = usePriceCellTicker({ symbol, price, changePercent, decimals, live: status === "live", reduced });

  if (status === "loading") {
    return <LoadingCell className={className} />;
  }

  const isStale = status === "live" && now - timestamp > staleAfterMs;
  // Design line 267: a reconnecting quote's price renders in the same
  // stale tone as an aged one, even though it isn't stale by timestamp.
  const priceInStaleTone = isStale || status === "reconnecting";

  return (
    <div
      className={["bp-price-cell", className].filter(Boolean).join(" ")}
      data-testid="price-cell"
      style={{ position: "relative", padding: "6px 10px", borderRadius: 8, textAlign: "right", minWidth: 124 }}
    >
      <FlashOverlay flash={flash} />

      <div
        data-testid="price-cell-price"
        style={{
          position: "relative",
          font: "500 15px/1.3 var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: priceInStaleTone ? "var(--bp-stale)" : "var(--foreground)",
        }}
      >
        {fmt(price, decimals)}
      </div>

      <StatusRow status={status} statusLabel={statusLabel} changePercent={changePercent} reduced={reduced} />

      {isStale ? <StaleLabel timestamp={timestamp} /> : null}

      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {announce}
      </span>
    </div>
  );
}

function LoadingCell({ className }: { className?: string }): ReactNode {
  return (
    <div className={["bp-price-cell", className].filter(Boolean).join(" ")} style={{ display: "grid", gap: 7 }} data-testid="price-cell">
      <Skeleton width={76} height={14} />
      <Skeleton width={54} height={10} />
      {/* "loading" is the design doc's caption for this state, not
          component copy — visually hidden, but still in the a11y tree
          and still findable by text in tests. */}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>loading</span>
    </div>
  );
}

function FlashOverlay({ flash }: { flash: FlashDirection }): ReactNode {
  const tone = flash === "up" ? "var(--bp-gain)" : flash === "down" ? "var(--bp-loss)" : undefined;
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: 8,
    pointerEvents: "none",
    opacity: flash ? 1 : 0,
    background: tone ? `color-mix(in oklch, ${tone} 22%, transparent)` : undefined,
    // A CSS `animation` (not a `transition`) so the tint is at full
    // strength immediately and decays linearly over --bp-dur-tick —
    // the export's `el.animate([{opacity:1},{opacity:0}], {duration:400})`.
    // A plain opacity transition can't do this: it only animates a
    // *change*, and `background` isn't transitioned at all here, so the
    // tint would vanish the instant the flash clears instead of fading.
    animation: flash ? "bp-tick-decay var(--bp-dur-tick) linear forwards" : undefined,
  };
  return <span aria-hidden="true" data-testid="price-cell-flash" className="bp-price-flash" data-flash={flash ?? undefined} style={style} />;
}

function StatusRow({
  status,
  statusLabel,
  changePercent,
  reduced,
}: {
  status: PriceCellStatus;
  statusLabel: string | undefined;
  changePercent: number;
  reduced: boolean;
}): ReactNode {
  if (status === "market-closed") {
    return (
      <div style={ROW_STYLE_MUTED}>
        <MoonIcon />
        {statusLabel}
      </div>
    );
  }
  if (status === "reconnecting") {
    return (
      <div style={ROW_STYLE_WARNING}>
        <SpinnerIcon reduced={reduced} />
        Reconnecting{statusLabel ? ` · ${statusLabel}` : ""}
      </div>
    );
  }
  const up = changePercent >= 0;
  return (
    <div data-testid="price-cell-change" style={{ position: "relative", font: "500 12px/1.3 var(--font-mono)", color: up ? "var(--bp-gain)" : "var(--bp-loss)" }}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {signed(changePercent, 2, "", "%")}
    </div>
  );
}

function StaleLabel({ timestamp }: { timestamp: number }): ReactNode {
  return (
    <div data-testid="price-cell-stale-label" style={ROW_STYLE_MUTED_SM}>
      <ClockIcon />
      stale {"·"} as of {formatTime(timestamp)}
    </div>
  );
}

const ROW_STYLE_MUTED: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 6,
  font: "600 10.5px/1.4 var(--font-body)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--foreground-muted)",
};

const ROW_STYLE_MUTED_SM: CSSProperties = {
  position: "relative",
  marginTop: 4,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 6,
  font: "500 11.5px/1.4 var(--font-mono)",
  color: "var(--foreground-muted)",
};

const ROW_STYLE_WARNING: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 6,
  font: "500 11.5px/1.4 var(--font-body)",
  color: "var(--warning)",
};

function MoonIcon(): ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function ClockIcon(): ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SpinnerIcon({ reduced }: { reduced: boolean }): ReactNode {
  return (
    <svg className={reduced ? undefined : "bp-spin"} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}
