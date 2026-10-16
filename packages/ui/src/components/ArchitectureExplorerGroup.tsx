"use client";

import type { CSSProperties, ReactNode } from "react";
import type { NodeProps } from "@xyflow/react";

export interface ArchFlowGroupData extends Record<string, unknown> {
  label: string;
  /** Set when the box is a node (a database): the label then selects it. */
  nodeId?: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const boxStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 18,
  boxSizing: "border-box",
  background: "color-mix(in oklch, var(--foreground) 3%, transparent)",
  border: "1px dashed color-mix(in oklch, var(--foreground) 16%, transparent)",
  pointerEvents: "none",
};

/**
 * A real React Flow node (type "archGroup"), not an absolutely-positioned
 * overlay div: member nodes are its children (parentId), so this rect pans
 * and zooms with the canvas's own transform instead of drifting out of
 * place -- see https://reactflow.dev/learn/layouting/sub-flows. Member
 * nodes are positioned relative to this node's own top-left corner.
 */
export function ArchitectureExplorerGroup({ data }: NodeProps): ReactNode {
  const { label, nodeId, selected, onSelect } = data as ArchFlowGroupData;
  const labelStyle: CSSProperties = {
    position: "absolute",
    // A box that is a node (a database) is entered from its left side by labelled lines, so its title sits at the right.
    ...(nodeId ? { right: 14 } : { left: 14 }),
    top: 8,
    font: "600 9.5px/1 var(--font-body)",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: selected ? "var(--ember)" : "var(--foreground-muted)",
  };
  return (
    <div style={boxStyle}>
      {nodeId && onSelect ? (
        <button
          type="button"
          className="bp-arch-group__label"
          aria-label={`${label}, Data`}
          aria-pressed={selected}
          onClick={() => onSelect(nodeId)}
          style={{ ...labelStyle, background: "transparent", border: 0, padding: 0, cursor: "pointer", pointerEvents: "auto" }}
        >
          {label}
        </button>
      ) : (
        <span className="bp-arch-group__label" style={labelStyle}>
          {label}
        </span>
      )}
    </div>
  );
}
