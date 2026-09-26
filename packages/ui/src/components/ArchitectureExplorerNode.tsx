"use client";

import type { CSSProperties, ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArchNodeData, ArchNodeKind } from "./ArchitectureExplorer.types.js";

export type ArchNodeVisualState = "same" | "added" | "removed" | "changed";

export interface ArchFlowNodeData extends Record<string, unknown> {
  node: ArchNodeData;
  visualState: ArchNodeVisualState;
  /** Planned but not yet built: this part predicts it, the real system doesn't have it. */
  ghosted: boolean;
  reduced: boolean;
  dimmed: boolean;
  touched: boolean;
  showData: boolean;
  onSelect: (id: string) => void;
}

const KIND_LABEL: Record<ArchNodeKind, string> = {
  actor: "Actor",
  app: "App",
  service: "Service",
  data: "Data",
  infra: "Infra",
  ext: "External",
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 60;

/**
 * Ported from renderDiagram()'s "blueprint" node style in bullpen.js
 * (~line 374-376): an eyebrow "KIND · meta" label over the node's name.
 * External nodes get a dashed border instead of a fill, matching the
 * design's external-system treatment.
 */
export function ArchitectureExplorerNode({ data, selected }: NodeProps): ReactNode {
  const { node, visualState, ghosted, reduced, dimmed, touched, showData, onSelect } = data as ArchFlowNodeData;
  const isExternal = node.kind === "ext";
  const hot = selected || touched;
  const removed = visualState === "removed";

  const boxStyle: CSSProperties = {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: node.kind === "data" ? 26 : 10,
    background: isExternal ? "var(--background)" : hot ? "color-mix(in oklch, var(--ember) 14%, var(--surface-elevated))" : "var(--surface-elevated)",
    border: hot ? "1.5px solid var(--ember)" : touched ? "1px solid color-mix(in oklch, var(--ember) 60%, transparent)" : ghosted ? "1px dashed var(--foreground-muted)" : isExternal ? "1px dashed color-mix(in oklch, var(--foreground) 30%, transparent)" : "1px solid color-mix(in oklch, var(--foreground) 16%, transparent)",
    padding: "8px 14px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 3,
    cursor: removed ? "default" : "pointer",
    opacity: dimmed ? 0.38 : ghosted ? 0.55 : 1,
    transition: "opacity 240ms, border-color 200ms, background 200ms",
    outline: "none",
    pointerEvents: removed ? "none" : "auto",
  };

  const animClass = reduced
    ? visualState === "added"
      ? "bp-arch-node--added-reduced"
      : removed
        ? "bp-arch-node--removed-reduced"
        : ""
    : visualState === "added"
      ? "bp-arch-node--added"
      : removed
        ? "bp-arch-node--removed"
        : "";

  return (
    <div
      role="button"
      tabIndex={removed ? -1 : 0}
      aria-label={`${node.label}, ${KIND_LABEL[node.kind]}`}
      aria-pressed={selected}
      onClick={() => !removed && onSelect(node.id)}
      onKeyDown={(e) => {
        if (!removed && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      className={animClass}
      style={{ position: "relative" }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={boxStyle}>
        {ghosted ? (
          <span
            style={{
              position: "absolute",
              top: -8,
              right: 8,
              font: "700 8.5px/1 var(--font-body)",
              letterSpacing: "0.16em",
              color: "var(--foreground-muted)",
              background: "var(--background)",
              padding: "0 4px",
            }}
          >
            PLANNED
          </span>
        ) : null}
        <span
          style={{
            font: "600 9px/1 var(--font-body)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--foreground-muted)",
          }}
        >
          {KIND_LABEL[node.kind]} · {node.meta}
        </span>
        <span style={{ font: "500 14px/1.2 var(--font-display)", letterSpacing: "-0.01em", color: "var(--foreground)" }}>
          {node.label}
        </span>
        {removed ? (
          <span
            aria-hidden="true"
            className={reduced ? "bp-arch-node__strike bp-arch-node__strike--reduced" : "bp-arch-node__strike"}
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              top: "50%",
              height: 1.5,
              background: "var(--foreground)",
            }}
          />
        ) : null}
      </div>
      {visualState === "changed" ? (
        <span
          aria-hidden="true"
          className={reduced ? "bp-arch-node__ring bp-arch-node__ring--reduced" : "bp-arch-node__ring"}
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: node.kind === "data" ? 30 : 14,
            border: "1.5px solid var(--ember)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {showData && node.db && !removed ? (
        <div
          style={{
            marginTop: 4,
            textAlign: "center",
            font: "500 9px/1 var(--font-mono)",
            color: "var(--foreground-muted)",
            padding: "3px 8px",
            borderRadius: 9999,
            background: "var(--surface-sunken)",
            display: "inline-block",
          }}
        >
          {node.id}_db
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
