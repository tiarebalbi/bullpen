"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Two shapes from the same section of the design system:
 *  - a segmented "toggle" chip (`chips`/`seg()` in trading.js: pressed
 *    chip inverts to foreground/background, unpressed stays panel-2),
 *  - a non-interactive "status" chip (pass / fail / Published / Next
 *    / Planned, ~line 504-508 of Bullpen Design System.dc.html).
 * Passing `onClick` renders a real <button aria-pressed>; omitting it
 * renders a <span>, since a status chip isn't a control.
 */
export type ChipTone = "neutral" | "gain" | "loss" | "accent" | "outline" | "published";

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONE_STYLE: Record<ChipTone, CSSProperties> = {
  neutral: { background: "var(--bp-panel-2)", color: "var(--foreground-muted)" },
  gain: { background: "color-mix(in oklch, var(--bp-gain) 14%, transparent)", color: "var(--bp-gain)" },
  loss: { background: "color-mix(in oklch, var(--destructive) 14%, transparent)", color: "var(--destructive)" },
  accent: { background: "color-mix(in oklch, var(--ember) 18%, transparent)", color: "var(--bp-accent-text)" },
  outline: { background: "transparent", color: "var(--foreground-muted)", border: "1px dashed var(--foreground-muted)" },
  // The design's Published chip (STATUS in Bullpen Landing.dc.html): lime, not grey.
  published: { background: "var(--lime-glow)", color: "var(--lime-glow-foreground)" },
};

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: "var(--radius-pill)",
  font: "600 11px/1 var(--font-mono)",
  border: 0,
};

export function Chip({ children, tone = "neutral", pressed, onClick, className }: ChipProps): ReactNode {
  const style: CSSProperties = {
    ...BASE_STYLE,
    ...TONE_STYLE[tone],
    ...(onClick
      ? {
          cursor: "pointer",
          font: "600 13px/1 var(--font-body)",
          background: pressed ? "var(--foreground)" : TONE_STYLE[tone].background,
          color: pressed ? "var(--background)" : TONE_STYLE[tone].color,
        }
      : null),
  };

  if (onClick) {
    return (
      <button type="button" className={["bp-chip", className].filter(Boolean).join(" ")} style={style} aria-pressed={pressed ?? false} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <span className={["bp-chip", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </span>
  );
}
