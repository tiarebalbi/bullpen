"use client";

import type { CSSProperties, ReactNode } from "react";
import type { NodeProps } from "@xyflow/react";

export interface ArchFlowGroupData extends Record<string, unknown> {
  label: string;
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
  const { label } = data as ArchFlowGroupData;
  return (
    <div style={boxStyle}>
      <span
        className="bp-arch-group__label"
        style={{
          position: "absolute",
          left: 14,
          top: 8,
          font: "600 9.5px/1 var(--font-body)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--foreground-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
