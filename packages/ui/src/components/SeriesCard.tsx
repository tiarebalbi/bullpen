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
  /** The part number. Absent for the bonus, which is a detour between two parts and has none. */
  part?: number;
  /** The bonus: a diamond and a "Bonus · Detour" tag where the part number goes, and an accent dashed border. */
  bonus?: boolean;
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
  /**
   * When the post is planned, as text ("Planned · Nov 11", "Nov 23"), with its ISO date. Shown only while there is no published `date`, and set apart from
   * one: dashed, italic, in a `<time>`. A plan, never a publish date.
   */
  plannedLabel?: string;
  plannedDate?: string;
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

const BONUS_STYLE: CSSProperties = {
  // The accent as a dashed border and a glow: a little more weight than its neighbours, in the same box, so the rail keeps its rhythm.
  border: "1.5px dashed var(--ember)",
  boxShadow: "var(--shadow-ember-glow)",
};

const VISUALLY_HIDDEN: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

const PLANNED_STYLE: CSSProperties = {
  // Positioned, so its visually hidden "Planned for" is placed inside the card and not at the far end of a scrolling rail (an absolute box escapes an overflow container that is not positioned).
  position: "relative",
  font: "italic 500 11.5px/1 var(--font-mono)",
  whiteSpace: "nowrap",
  color: "var(--foreground-muted)",
  border: "1px dashed var(--foreground-muted)",
  borderRadius: "var(--radius-pill)",
  padding: "4px 8px",
};

/** A diamond, for the bonus where a part has its number. Decorative: the tag beside it says what it is. */
function Diamond(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" style={{ color: "var(--bp-accent-text)", flex: "none" }}>
      <path d="M6 0.5 11.5 6 6 11.5 0.5 6Z" fill="currentColor" />
    </svg>
  );
}

export function SeriesCard({
  part,
  bonus = false,
  title,
  status,
  introduced,
  date,
  href,
  dateLabel,
  plannedLabel,
  plannedDate,
  className,
}: SeriesCardProps): ReactNode {
  return (
    <div className={["bp-series-card", bonus ? "bp-series-card--bonus" : undefined, className].filter(Boolean).join(" ")} data-kind={bonus ? "bonus" : "part"} style={bonus ? { ...CARD_STYLE, ...BONUS_STYLE } : CARD_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 8px" }}>
        {bonus ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "700 11px/1 var(--font-mono)", color: "var(--bp-accent-text)" }}>
            <Diamond />
            Bonus · Detour
          </span>
        ) : (
          <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--foreground-muted)", whiteSpace: "nowrap" }}>Part {part}</span>
        )}
        <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
      </div>
      <div
        style={{
          font: bonus ? "500 23px/1.12 var(--font-display)" : "500 21px/1.12 var(--font-display)",
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
          flexWrap: "wrap",
          gap: "8px 6px",
          paddingTop: 12,
          borderTop: "1px solid var(--bp-hair)",
        }}
      >
        {date && dateLabel ? (
          <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--foreground-muted)", whiteSpace: "nowrap" }}>{dateLabel}</span>
        ) : plannedLabel && !date ? (
          <time dateTime={plannedDate} style={PLANNED_STYLE} data-planned="true">
            {/^Planned/.test(plannedLabel) ? plannedLabel : <><span style={VISUALLY_HIDDEN}>Planned for </span>{plannedLabel}</>}
          </time>
        ) : (
          <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>{status === "published" ? "" : "Not yet published"}</span>
        )}
        {href ? (
          <a
            href={href}
            style={{
              color: "var(--bp-accent-text)",
              font: "700 12.5px/1 var(--font-body)",
              textDecoration: "none",
              padding: "6px 0",
              whiteSpace: "nowrap",
            }}
          >
            See it →
          </a>
        ) : null}
      </div>
    </div>
  );
}
