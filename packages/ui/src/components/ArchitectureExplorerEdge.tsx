"use client";

import type { ReactNode } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { ArchEdgeType } from "./ArchitectureExplorer.types.js";

export interface ArchFlowEdgeData extends Record<string, unknown> {
  type: ArchEdgeType;
  ghosted: boolean;
  onPath: boolean;
  dimmed: boolean;
  showType: boolean;
  reduced: boolean;
}

const LINE = "color-mix(in oklch, var(--foreground) 32%, transparent)";

/**
 * Ported from renderDiagram()'s edge rendering in bullpen.js (~line
 * 342-361): sync = solid line + a sliding dashed overlay ("the call is
 * flowing"); async = dashed line + three small packets animating along
 * the exact path via SVG <animateMotion>, staggered so they read as a
 * stream, not one dot. Reduced motion drops both animated layers, leaving
 * just the static solid/dashed distinction.
 */
export function ArchitectureExplorerEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps): ReactNode {
  const { type, ghosted, onPath, dimmed, showType, reduced } = data as ArchFlowEdgeData;
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const isAsync = type === "async" && showType;
  const stroke = onPath ? "var(--ember)" : LINE;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd="url(#bp-arch-arrow)"
        style={{
          stroke,
          strokeWidth: onPath ? 1.75 : 1.25,
          strokeDasharray: isAsync ? "4 5" : undefined,
          opacity: dimmed ? 0.25 : ghosted ? 0.4 : 1,
          transition: "opacity 240ms, stroke 200ms",
        }}
      />
      {!reduced && !ghosted && !isAsync && showType && type === "sync" ? (
        <path
          d={path}
          className="bp-arch-edge__flow"
          style={{
            fill: "none",
            stroke: "var(--ember)",
            strokeWidth: 1.5,
            strokeLinecap: "round",
            strokeDasharray: "1.5 22.5",
            opacity: dimmed ? 0 : 0.85,
          }}
        />
      ) : null}
      {!reduced && !ghosted && isAsync
        ? [0, 1, 2].map((i) => {
            const begin = i * 0.45;
            return (
              <circle key={i} r={2.8} style={{ fill: dimmed ? "transparent" : "var(--ember)" }}>
                <animateMotion dur="1.6s" begin={`${begin}s`} repeatCount="indefinite" path={path} />
                <animate
                  attributeName="opacity"
                  dur="1.6s"
                  begin={`${begin}s`}
                  repeatCount="indefinite"
                  values="0;1;1;0"
                  keyTimes="0;0.1;0.8;1"
                />
              </circle>
            );
          })
        : null}
    </>
  );
}
