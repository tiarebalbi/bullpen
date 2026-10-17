"use client";

import type { ReactNode } from "react";

/**
 * The card every trading-app screen sits in: a title, an optional aside (a status, a time) and the content. From the
 * design's panel (--bp-panel on --bp-hair, radius --radius-lg). It is a region named by its title.
 */
export interface PanelProps {
  title: string;
  /** The region's accessible name, when it should differ from the visible title. */
  label?: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, label, aside, children }: PanelProps): ReactNode {
  return (
    <section aria-label={label ?? title} className="bp-panel" style={{ background: "var(--bp-panel)", border: "1px solid var(--bp-hair)", borderRadius: "var(--radius-lg)", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h2 style={{ margin: 0, font: "500 20px/1.2 var(--font-display)", letterSpacing: "-0.02em" }}>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
