"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Ported from Bullpen Landing.dc.html's theme button (~line 58, desktop;
 * ~line 245, mobile): a round icon button using the same sun glyph for
 * both themes (the export never swaps to a moon icon). Controlled: the
 * caller owns the actual theme state and its persistence (localStorage is
 * a per-viewer concern, not something this shared component should own).
 */
export interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  /** Larger hit target for the mobile header, matching the design's 44px mobile icon buttons. */
  size?: "sm" | "md";
  className?: string;
}

const SIZE_PX: Record<NonNullable<ThemeToggleProps["size"]>, number> = {
  sm: 40,
  md: 44,
};

export function ThemeToggle({ theme, onToggle, size = "sm", className }: ThemeToggleProps): ReactNode {
  const px = SIZE_PX[size];
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  const style: CSSProperties = {
    width: px,
    height: px,
    border: 0,
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    background: "var(--surface-sunken)",
    color: "var(--foreground)",
    display: "grid",
    placeItems: "center",
  };

  return (
    <button
      type="button"
      aria-label={label}
      // The caller's initial `theme` is read from the DOM class an inline
      // script set before hydration (see apps/landing/app/lib/useTheme.ts),
      // which the server can't know -- an expected, narrow mismatch for
      // returning light-theme visitors, not a real bug to silence broadly.
      suppressHydrationWarning
      onClick={onToggle}
      className={["bp-theme-toggle", className].filter(Boolean).join(" ")}
      style={style}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  );
}
