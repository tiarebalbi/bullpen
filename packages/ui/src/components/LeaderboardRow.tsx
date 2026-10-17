"use client";

import type { ReactNode } from "react";
import { fmt } from "../lib/format.js";

/**
 * One row of the leaderboard, from "LeaderboardRow" in Bullpen Design System.dc.html: a rank, a monogram avatar, the
 * handle with its cash beneath, and the equity in tabular figures. The design's gain percentage and sparkline are not
 * here: they need an opening balance and a history, neither of which the ranking carries, so showing them would be
 * invented data. Rank order is carried by the number, never by colour.
 */
export interface LeaderboardRowProps {
  rank: number;
  handle: string;
  equity: number;
  cash: number;
  /** Marks the signed-in player's own row; the label is text, so it does not rest on colour. */
  you?: boolean;
}

const initials = (handle: string): string => handle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";

export function LeaderboardRow({ rank, handle, equity, cash, you = false }: LeaderboardRowProps): ReactNode {
  return (
    <li className="bp-leaderboard-row" data-you={you || undefined} style={{ display: "grid", gridTemplateColumns: "32px 40px minmax(0, 1fr) auto", alignItems: "center", gap: 12, padding: "10px 4px" }}>
      <span style={{ font: "500 13px/1 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--foreground-muted)" }}>{rank}</span>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "9999px", display: "grid", placeItems: "center", background: "var(--bp-panel-2)", font: "600 11px/1 var(--font-mono)" }}>
        {initials(handle)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", font: "600 15px/1.3 var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {handle}
          {you ? <span style={{ marginLeft: 8, font: "600 10.5px/1 var(--font-body)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bp-accent-text)" }}>you</span> : null}
        </span>
        <span style={{ display: "block", font: "500 12px/1.4 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--foreground-muted)" }}>cash ${fmt(cash)}</span>
      </span>
      <span style={{ font: "500 15px/1.3 var(--font-mono)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>${fmt(equity)}</span>
    </li>
  );
}

export interface LeaderboardListProps {
  /** Accessible name for the list, e.g. "Players ranked by equity". */
  label: string;
  children: ReactNode;
}

export function LeaderboardList({ label, children }: LeaderboardListProps): ReactNode {
  return (
    <ol aria-label={label} className="bp-leaderboard-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
      {children}
    </ol>
  );
}
