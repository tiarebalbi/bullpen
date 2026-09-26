"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * "Skeletons match the final layout. Reduced motion: no pulse."
 * — Bullpen Design System.dc.html, Loading state (~line 513-519).
 * The CATALOG entry for SkeletonPulse confirms it: 900ms alternate
 * opacity loop, reduced-motion swaps it for static blocks.
 *
 * The pulse and its reduced-motion override both live in `.bp-skeleton`
 * (styles.css) as plain CSS, not a `useReducedMotion()` read: this
 * component renders identically on the server and on first client
 * paint, so there's nothing to hydrate around.
 */
export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ width = "100%", height = 12, radius = 4, className }: SkeletonProps): ReactNode {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span data-testid="skeleton" aria-hidden="true" className={["bp-skeleton", className].filter(Boolean).join(" ")} style={style} />;
}
