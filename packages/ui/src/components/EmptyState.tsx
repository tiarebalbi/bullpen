"use client";

import type { ReactNode } from "react";
import { Button } from "./Button.js";

/**
 * "Empty and error states always offer a next step."
 * — Bullpen Design System.dc.html (~line 488, 521-526). All copy is a
 * prop: this component ports the *shape* ("No positions yet" + body +
 * CTA), never the export's placeholder copy or dollar figures — those
 * would be invented data if hardcoded here.
 */
export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps): ReactNode {
  return (
    <div
      className="bp-empty-state"
      style={{ background: "var(--bp-panel)", border: "1px solid var(--bp-hair)", borderRadius: "var(--radius-lg)", padding: 24 }}
    >
      <div style={{ font: "600 11px/1 var(--font-body)", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--foreground-muted)" }}>
        Empty
      </div>
      <div style={{ marginTop: 18, font: "500 20px/1.2 var(--font-display)", letterSpacing: "-0.02em" }}>{title}</div>
      {description ? (
        <div style={{ marginTop: 8, font: "400 13.5px/1.6 var(--font-body)", color: "var(--foreground-muted)" }}>{description}</div>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction} style={{ marginTop: 18, padding: "11px 18px", font: "700 13px/1 var(--font-body)" }}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
