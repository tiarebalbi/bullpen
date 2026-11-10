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
  /**
   * A short line under the name, for the player's own row alone (where their handle stands: "Handle in review"). It is text, never colour, and one line. `full` is the whole
   * sentence behind it, for the accessible name and the tooltip: what a screen reader reads instead of the short line.
   */
  note?: { text: string; full?: string };
  /** Under the cash line: something the viewer can do about this row (reporting a handle). The row draws it and knows nothing about it. */
  action?: ReactNode;
}

/** Two characters for a monogram: the first two letters or digits of a handle, upper case. */
export const handleInitials = (handle: string): string => handle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";

export function LeaderboardRow({ rank, handle, equity, cash, you = false, note, action }: LeaderboardRowProps): ReactNode {
  return (
    <li className="bp-leaderboard-row" data-you={you || undefined} style={{ display: "grid", gridTemplateColumns: "32px 40px minmax(0, 1fr) auto", alignItems: "center", gap: 12, padding: "10px 4px" }}>
      <span style={{ font: "500 13px/1 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--foreground-muted)" }}>{rank}</span>
      <span aria-hidden="true" className="bp-leaderboard-row__avatar" style={{ width: 40, height: 40, borderRadius: "9999px", display: "grid", placeItems: "center", background: "var(--bp-panel-2)", font: "600 11px/1 var(--font-mono)" }}>
        {handleInitials(handle)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", font: "600 15px/1.3 var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {handle}
          {you ? <span style={{ marginLeft: 8, font: "600 10.5px/1 var(--font-body)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bp-accent-text)" }}>You</span> : null}
        </span>
        <span style={{ display: "block", font: "500 12px/1.4 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--foreground-muted)" }}>cash ${fmt(cash)}</span>
        {note ? (
          <span data-testid="leaderboard-own-note" title={note.full} style={{ position: "relative", display: "block", font: "500 12px/1.4 var(--font-body)", color: "var(--foreground-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span aria-hidden={note.full ? true : undefined}>{note.text}</span>
            {note.full ? <span className="bp-visually-hidden">{note.full}</span> : null}
          </span>
        ) : null}
        {action ? <span style={{ display: "block" }}>{action}</span> : null}
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
