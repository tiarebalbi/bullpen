"use client";

import type { ReactNode } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { ArchEdgeRate, ArchEdgeType } from "./ArchitectureExplorer.types.js";
import { EdgePulses } from "./ArchitectureExplorerTraffic.js";

export interface ArchFlowEdgeData extends Record<string, unknown> {
  type: ArchEdgeType;
  ghosted: boolean;
  onPath: boolean;
  dimmed: boolean;
  showType: boolean;
  reduced: boolean;
  /** The database role and access, written on the connection while the "Data ownership" toggle is on. */
  label?: string;
  /** A line that has a rate: its pulses, in the colour they take, still or moving. Absent for a line with no rate (it keeps the old animation). */
  traffic?: { rate: ArchEdgeRate; color: string; still: boolean };
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
  const { type, ghosted, onPath, dimmed, showType, reduced, label, traffic } = data as ArchFlowEdgeData;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
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
        label={label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={{ font: "600 9.5px/1 var(--font-mono)", fill: "var(--foreground)" }}
        labelBgStyle={{ fill: "var(--surface-elevated)", fillOpacity: 0.92 }}
        labelBgPadding={[6, 3]}
        labelBgBorderRadius={6}
      />
      {traffic ? (
        <>
          <EdgePulses path={path} rate={traffic.rate} look={{ color: traffic.color, still: traffic.still, onPath }} edgeId={id} />
          {traffic.still && !ghosted && !dimmed ? <StaticArrows id={id} /> : null}
        </>
      ) : (
        <LegacyFlow path={path} type={type} isAsync={isAsync} state={{ ghosted, dimmed, reduced, showType }} />
      )}
    </>
  );
}

/** Three arrowheads along a line that is not moving, pointing the way requests go: what a still picture shows instead of pulses. */
function StaticArrows({ id }: { id: string }): ReactNode {
  return (
    <text aria-hidden="true" style={{ font: "700 13px/1 var(--font-mono)", fill: "var(--foreground-muted)" }}>
      {["25%", "50%", "75%"].map((offset) => (
        <textPath key={offset} href={`#${id}`} startOffset={offset} dominantBaseline="central">
          ›
        </textPath>
      ))}
    </text>
  );
}

/** A synchronous call's sliding dash, which says "the call is flowing". */
function SyncDash({ path, dimmed }: { path: string; dimmed: boolean }): ReactNode {
  return (
    <path
      d={path}
      className="bp-arch-edge__flow"
      style={{ fill: "none", stroke: "var(--ember)", strokeWidth: 1.5, strokeLinecap: "round", strokeDasharray: "1.5 22.5", opacity: dimmed ? 0 : 0.85 }}
    />
  );
}

/** An asynchronous call's three packets, staggered so they read as a stream, not one dot. */
function AsyncPackets({ path, dimmed }: { path: string; dimmed: boolean }): ReactNode {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <circle key={i} r={2.8} style={{ fill: dimmed ? "transparent" : "var(--ember)" }}>
          <animateMotion dur="1.6s" begin={`${i * 0.45}s`} repeatCount="indefinite" path={path} />
          <animate attributeName="opacity" dur="1.6s" begin={`${i * 0.45}s`} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.1;0.8;1" />
        </circle>
      ))}
    </>
  );
}

/** The animation a line has when it carries no rate: a sliding dash for a synchronous call, packets for an asynchronous one. */
function LegacyFlow(props: { path: string; type: ArchEdgeType; isAsync: boolean; state: { ghosted: boolean; dimmed: boolean; reduced: boolean; showType: boolean } }): ReactNode {
  const { path, type, isAsync } = props;
  const { ghosted, dimmed, reduced, showType } = props.state;
  if (reduced || ghosted) return null;
  if (isAsync) return <AsyncPackets path={path} dimmed={dimmed} />;
  return showType && type === "sync" ? <SyncDash path={path} dimmed={dimmed} /> : null;
}
