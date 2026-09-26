"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "../lib/useReducedMotion.js";

/**
 * "Each state has its own glyph and words, so it reads without
 * color." — Bullpen Design System.dc.html, ConnectionIndicator
 * section (~line 302). Five states are shown there: Live, Delayed
 * (stock quotes, 15-minute delay), Stale, Reconnecting and Offline.
 * Every state renders a distinct, visible text label — never color
 * alone — plus whatever `detail` string the caller supplies (age,
 * attempt count, retry countdown); none of that copy is invented
 * here.
 */
export type ConnectionStatus = "live" | "delayed" | "stale" | "reconnecting" | "offline";

export interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  /** e.g. "0.4s ago", "15 min", "last 14:02:11", "attempt 2 of 5", "retry in 8s". */
  detail?: string;
  /** Only used when status is "offline"; renders a "Retry now" action. */
  onRetry?: () => void;
  className?: string;
}

const LABEL: Record<ConnectionStatus, string> = {
  live: "Live",
  delayed: "Delayed",
  stale: "Stale",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

export function ConnectionIndicator({ status, detail, onRetry, className }: ConnectionIndicatorProps): ReactNode {
  const reduced = useReducedMotion();

  return (
    <span
      className={["bp-connection-indicator", className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 14px",
        borderRadius: "9999px",
        background: "var(--surface-sunken)",
        font: "600 13px/1 var(--font-body)",
      }}
    >
      <Glyph status={status} reduced={reduced} />
      <span>{LABEL[status]}</span>
      {detail ? (
        <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>{detail}</span>
      ) : null}
      {status === "offline" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            border: 0,
            background: "transparent",
            cursor: "pointer",
            font: "600 12.5px/1 var(--font-body)",
            color: "var(--bp-accent-text)",
            padding: 0,
          }}
        >
          Retry now
        </button>
      ) : null}
    </span>
  );
}

function Glyph({ status, reduced }: { status: ConnectionStatus; reduced: boolean }): ReactNode {
  const glyphs: Record<ConnectionStatus, ReactNode> = {
    live: <LiveDot reduced={reduced} />,
    delayed: <ClockGlyph />,
    stale: <StaleRing />,
    reconnecting: <SpinnerGlyph reduced={reduced} />,
    offline: <OfflineCross />,
  };
  return glyphs[status];
}

function LiveDot({ reduced }: { reduced: boolean }): ReactNode {
  return (
    <span style={{ position: "relative", width: 8, height: 8 }} aria-hidden="true">
      <span
        className={reduced ? undefined : "bp-live-pulse"}
        style={{ position: "absolute", inset: 0, borderRadius: "9999px", background: "var(--ember)" }}
      />
      <span style={{ position: "absolute", inset: 0, borderRadius: "9999px", background: "var(--ember)", boxShadow: "0 0 10px var(--ember)" }} />
    </span>
  );
}

function ClockGlyph(): ReactNode {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function StaleRing(): ReactNode {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 9, height: 9, borderRadius: "9999px", border: "1.5px solid var(--bp-stale)" }} />;
}

function SpinnerGlyph({ reduced }: { reduced: boolean }): ReactNode {
  return (
    <svg className={reduced ? undefined : "bp-spin"} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.4" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

function OfflineCross(): ReactNode {
  return (
    <span aria-hidden="true" style={{ font: "700 13px/1 var(--font-mono)", color: "var(--destructive)" }}>
      {"✕"}
    </span>
  );
}
