"use client";

import type { ReactNode } from "react";
import { Button } from "./Button.js";

/**
 * Ported from the "Error" card in Bullpen Design System.dc.html
 * (~line 527-532): title + explanation + a retry action + a
 * "last good" timestamp, all supplied by the caller — no invented
 * copy, no hardcoded "14:02".
 */
export interface ErrorStateProps {
  title: ReactNode;
  description?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  /** e.g. "last good · 14:02" — the caller formats this. */
  lastGoodLabel?: string;
}

export function ErrorState({ title, description, retryLabel, onRetry, lastGoodLabel }: ErrorStateProps): ReactNode {
  return (
    <div
      className="bp-error-state"
      role="alert"
      style={{ background: "var(--bp-panel)", border: "1px solid var(--bp-hair)", borderRadius: "var(--radius-lg)", padding: 24 }}
    >
      <div style={{ font: "600 11px/1 var(--font-body)", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--foreground-muted)" }}>
        Error
      </div>
      <div style={{ marginTop: 18, font: "500 20px/1.2 var(--font-display)", letterSpacing: "-0.02em" }}>{title}</div>
      {description ? (
        <div style={{ marginTop: 8, font: "400 13.5px/1.6 var(--font-body)", color: "var(--foreground-muted)" }}>{description}</div>
      ) : null}
      {(retryLabel && onRetry) || lastGoodLabel ? (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
          {retryLabel && onRetry ? (
            <Button variant="secondary" onClick={onRetry} style={{ padding: "11px 18px", font: "700 13px/1 var(--font-body)" }}>
              {retryLabel}
            </Button>
          ) : null}
          {lastGoodLabel ? (
            <span style={{ font: "500 11.5px/1.3 var(--font-mono)", color: "var(--foreground-muted)" }}>{lastGoodLabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
