"use client";

import type { CSSProperties, ReactNode } from "react";
import { Chip, type ChipTone } from "./Chip.js";

/**
 * Ported from the series-card markup in Bullpen Landing.dc.html (~line
 * 106-111, desktop; ~line 274-279, mobile): part number + status chip,
 * title, an "Introduced" line, and a date/link footer. The design's own
 * per-part sample copy is never used here -- callers supply real text
 * (content/series.json in apps/landing).
 */
export type SeriesCardStatus = "published" | "next" | "planned";

export interface SeriesCardProps {
  part: number;
  title: string;
  status: SeriesCardStatus;
  /** What this part's architecture record introduces, e.g. "A queue absorbs the market-open burst." */
  introduced: string;
  /** ISO date this part was actually published, or null/undefined if it hasn't been yet. */
  date?: string | null;
  /** Link to the post, or omitted/empty when unpublished. */
  href?: string;
  /** Rendered date text when `date` is set, e.g. "Oct 4, 2026" -- callers format it (locale-aware). */
  dateLabel?: string;
  className?: string;
}

const STATUS_TONE: Record<SeriesCardStatus, ChipTone> = {
  published: "published",
  next: "accent",
  planned: "outline",
};

// Natural-case text (never shouted caps in the markup): a screen reader or
// search engine should read "Published", not letters/a fabricated acronym.
const STATUS_LABEL: Record<SeriesCardStatus, string> = {
  published: "Published",
  next: "Next",
  planned: "Planned",
};

const CARD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  minHeight: 280,
  padding: "var(--space-5)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bp-panel)",
  border: "1px solid var(--bp-hair)",
  boxSizing: "border-box",
};

export function SeriesCard({
  part,
  title,
  status,
  introduced,
  date,
  href,
  dateLabel,
  className,
}: SeriesCardProps): ReactNode {
  return (
    <div className={["bp-series-card", className].filter(Boolean).join(" ")} style={CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>Part {part}</span>
        <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
      </div>
      <div
        style={{
          font: "500 21px/1.12 var(--font-display)",
          letterSpacing: "-0.02em",
          textWrap: "pretty",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: "auto" }}>
        <div
          style={{
            font: "600 10px/1 var(--font-body)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--foreground-muted)",
          }}
        >
          Introduced
        </div>
        <div style={{ marginTop: 6, font: "500 13.5px/1.45 var(--font-body)" }}>{introduced}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 12,
          borderTop: "1px solid var(--bp-hair)",
        }}
      >
        <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>
          {date && dateLabel ? dateLabel : "Not yet published"}
        </span>
        {href ? (
          <a
            href={href}
            style={{
              color: "var(--bp-accent-text)",
              font: "700 12.5px/1 var(--font-body)",
              textDecoration: "none",
              padding: "6px 0",
            }}
          >
            See it →
          </a>
        ) : null}
      </div>
    </div>
  );
}
