"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useReducedMotion } from "../lib/useReducedMotion.js";
import { ArchitectureExplorerNode, type ArchFlowNodeData, type ArchNodeVisualState } from "./ArchitectureExplorerNode.js";
import { ArchitectureExplorerEdge, type ArchFlowEdgeData } from "./ArchitectureExplorerEdge.js";
import { ArchitectureExplorerGroup, type ArchFlowGroupData } from "./ArchitectureExplorerGroup.js";
import type { ArchGroupData, ArchNodeData, ArchPartData } from "./ArchitectureExplorer.types.js";

export type { ArchNodeKind, ArchNodeData, ArchEdgeData, ArchGroupData, ArchPartData, ArchRequestStep, ArchRequestData } from "./ArchitectureExplorer.types.js";

export interface ArchitectureExplorerProps {
  /** All six parts, sorted by part number. */
  parts: ArchPartData[];
  initialPart?: number;
  /** Real ADR titles keyed by id (e.g. { "ADR-0001": "Stack" }), for the side panel. */
  adrTitles: Record<string, string>;
  /** hrefs for each ADR id, e.g. for a deep link into the Decisions section/modal. */
  adrHrefs: Record<string, string>;
  /** Called after the visitor (or the scrubber's autoplay) moves from one part to another. */
  onPartChange?: (from: number, to: number) => void;
  className?: string;
}

const NODE_TYPES = { archNode: ArchitectureExplorerNode, archGroup: ArchitectureExplorerGroup };
const EDGE_TYPES = { archEdge: ArchitectureExplorerEdge };
const GROUP_NODE_WIDTH = 176;
const GROUP_NODE_HEIGHT = 60;
const GROUP_PAD = 24;

/** Bounding box (in the same absolute coordinate space as node.x/y) around a group's real member nodes. */
function groupBounds(group: ArchGroupData, nodesById: Map<string, ArchNodeData>): { x: number; y: number; width: number; height: number } | null {
  const members = group.nodeIds.map((id) => nodesById.get(id)).filter((n): n is ArchNodeData => Boolean(n));
  if (members.length === 0) return null;
  const x0 = Math.min(...members.map((n) => n.x)) - GROUP_PAD;
  const y0 = Math.min(...members.map((n) => n.y)) - GROUP_PAD - 16;
  const x1 = Math.max(...members.map((n) => n.x + GROUP_NODE_WIDTH)) + GROUP_PAD;
  const y1 = Math.max(...members.map((n) => n.y + GROUP_NODE_HEIGHT)) + GROUP_PAD;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const REQUEST_STEP_MS = 1900;
const SCRUB_PLAY_MS = 2400;
const REMOVE_ANIM_MS = 940;

function diffNodeState(node: ArchNodeData, prevNodesById: Map<string, ArchNodeData>, currIds: Set<string>): ArchNodeVisualState {
  const prev = prevNodesById.get(node.id);
  const inCurr = currIds.has(node.id);
  if (inCurr && !prev) return "added";
  if (!inCurr && prev) return "removed";
  if (prev && (prev.purpose !== node.purpose || prev.meta !== node.meta)) return "changed";
  return "same";
}

export function ArchitectureExplorer(props: ArchitectureExplorerProps): ReactNode {
  return (
    <ReactFlowProvider>
      <ArchitectureExplorerInner {...props} />
    </ReactFlowProvider>
  );
}

function ArchitectureExplorerInner({
  parts,
  initialPart = 1,
  adrTitles,
  adrHrefs,
  onPartChange,
  className,
}: ArchitectureExplorerProps): ReactNode {
  const reduced = useReducedMotion();
  const { fitView } = useReactFlow();
  const partsById = useMemo(() => new Map(parts.map((p) => [p.part, p])), [parts]);
  const maxPart = parts.length;

  const [part, setPart] = useState(initialPart);
  const [prevPart, setPrevPart] = useState(initialPart);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showQuanta, setShowQuanta] = useState(true);
  const [showType, setShowType] = useState(true);
  const [showData, setShowData] = useState(false);
  const [scrubPlaying, setScrubPlaying] = useState(false);
  const [request, setRequest] = useState<{ on: boolean; idx: number; playing: boolean }>({
    on: false,
    idx: 0,
    playing: false,
  });
  const [settling, setSettling] = useState(false);

  const current = partsById.get(part) ?? parts[0]!;
  const previous = partsById.get(prevPart) ?? current;

  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const partRef = useRef(part);
  useEffect(() => {
    partRef.current = part;
  }, [part]);

  // One call per move, whichever control caused it (click, arrow key, autoplay).
  const reportedPart = useRef(initialPart);
  useEffect(() => {
    if (reportedPart.current === part) return;
    onPartChange?.(reportedPart.current, part);
    reportedPart.current = part;
  }, [part, onPartChange]);

  const goToPart = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(maxPart, next));
      if (clamped === part) return;
      setPrevPart(part);
      setPart(clamped);
      setSelectedId((id) => {
        const stillExists = id ? partsById.get(clamped)?.nodes.some((n) => n.id === id) : false;
        return stillExists ? id : null;
      });
      setRequest({ on: false, idx: 0, playing: false });
      if (requestTimer.current) clearInterval(requestTimer.current);
      setSettling(true);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      removeTimer.current = setTimeout(() => setSettling(false), reduced ? 420 : REMOVE_ANIM_MS);
    },
    [maxPart, part, partsById, reduced],
  );

  useEffect(() => {
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
      if (scrubTimer.current) clearInterval(scrubTimer.current);
      if (requestTimer.current) clearInterval(requestTimer.current);
    };
  }, []);

  const toggleScrubPlay = useCallback(() => {
    if (scrubPlaying) {
      if (scrubTimer.current) clearInterval(scrubTimer.current);
      setScrubPlaying(false);
      return;
    }
    setScrubPlaying(true);
    if (part >= maxPart) goToPart(1);
    scrubTimer.current = setInterval(() => {
      const p = partRef.current;
      if (p >= maxPart) {
        if (scrubTimer.current) clearInterval(scrubTimer.current);
        setScrubPlaying(false);
        return;
      }
      setPrevPart(p);
      setSettling(true);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      removeTimer.current = setTimeout(() => setSettling(false), reduced ? 420 : REMOVE_ANIM_MS);
      setPart(p + 1);
    }, SCRUB_PLAY_MS);
  }, [scrubPlaying, part, maxPart, goToPart, reduced]);

  const startRequest = useCallback(() => {
    setSelectedId(null);
    setRequest({ on: true, idx: 0, playing: true });
  }, []);

  const stopRequest = useCallback(() => {
    if (requestTimer.current) clearInterval(requestTimer.current);
    setRequest({ on: false, idx: 0, playing: false });
  }, []);

  const requestSteps = current.request.steps;

  const toggleRequestPlay = useCallback(() => {
    setRequest((r) => {
      if (r.playing) {
        if (requestTimer.current) clearInterval(requestTimer.current);
        return { ...r, playing: false };
      }
      const restart = r.idx >= requestSteps.length - 1;
      return { ...r, playing: true, idx: restart ? 0 : r.idx };
    });
  }, [requestSteps.length]);

  useEffect(() => {
    if (!request.playing) return;
    requestTimer.current = setInterval(() => {
      setRequest((r) => {
        if (r.idx >= requestSteps.length - 1) {
          if (requestTimer.current) clearInterval(requestTimer.current);
          return { ...r, playing: false };
        }
        return { ...r, idx: r.idx + 1 };
      });
    }, REQUEST_STEP_MS);
    return () => {
      if (requestTimer.current) clearInterval(requestTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.playing]);

  const stepTo = useCallback((i: number) => {
    if (requestTimer.current) clearInterval(requestTimer.current);
    setRequest((r) => ({ ...r, idx: Math.max(0, Math.min(requestSteps.length - 1, i)), playing: false }));
  }, [requestSteps.length]);

  // Union of previous + current part's nodes/edges while "settling" (so
  // removed items get to play their exit animation instead of just
  // vanishing), collapsing to just the current part's set once ArchitectureExplorer.tsx's own
  // 940ms exit-animation timer clears `settling`.
  const displayNodes: ArchNodeData[] = useMemo(() => {
    const currIds = new Set(current.nodes.map((n) => n.id));
    if (!settling || previous.part === current.part) return current.nodes;
    const prevNodesById = new Map(previous.nodes.map((n) => [n.id, n]));
    const merged = new Map<string, ArchNodeData>();
    for (const n of current.nodes) merged.set(n.id, n);
    for (const n of previous.nodes) if (!merged.has(n.id)) merged.set(n.id, n);
    return Array.from(merged.values()).filter((n) => currIds.has(n.id) || prevNodesById.has(n.id));
  }, [current, previous, settling]);

  const nodeStates = useMemo(() => {
    const prevNodesById = new Map(previous.nodes.map((n) => [n.id, n]));
    const currIds = new Set(current.nodes.map((n) => n.id));
    const map = new Map<string, ArchNodeVisualState>();
    for (const n of displayNodes) {
      map.set(n.id, settling ? diffNodeState(n, prevNodesById, currIds) : currIds.has(n.id) ? "same" : "removed");
    }
    return map;
  }, [displayNodes, previous, current, settling]);

  const displayEdges = useMemo(() => {
    if (!settling || previous.part === current.part) return current.edges;
    const currIds = new Set(current.edges.map((e) => e.id));
    const nodeIdSet = new Set(displayNodes.map((n) => n.id));
    const merged = new Map<string, (typeof current.edges)[number]>();
    for (const e of current.edges) merged.set(e.id, e);
    for (const e of previous.edges) if (!merged.has(e.id)) merged.set(e.id, e);
    return Array.from(merged.values()).filter((e) => nodeIdSet.has(e.a) && nodeIdSet.has(e.b) && (currIds.has(e.id) || !currIds.has(e.id)));
  }, [current, previous, settling, displayNodes]);

  const selectedNode = selectedId ? current.nodes.find((n) => n.id === selectedId) : null;

  // Ghosting marks a node/edge as not real yet: present in a *planned* part
  // but absent from the built system (only Part 1 is built today). Real
  // parts never ghost anything of their own.
  const builtNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of parts) if (p.status === "built") for (const n of p.nodes) ids.add(n.id);
    return ids;
  }, [parts]);
  const builtEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of parts) if (p.status === "built") for (const e of p.edges) ids.add(e.id);
    return ids;
  }, [parts]);

  const activeStep = request.on ? requestSteps[request.idx] : null;
  const touchedIds = useMemo(() => {
    const set = new Set<string>();
    if (!request.on) return set;
    for (let i = 0; i <= request.idx; i++) {
      const step = requestSteps[i];
      const edge = current.edges.find((e) => e.id === step?.edge);
      if (edge) {
        set.add(edge.a);
        set.add(edge.b);
      }
    }
    return set;
  }, [request, requestSteps, current.edges]);

  const groups = useMemo(() => (showQuanta ? current.groups : []), [showQuanta, current.groups]);

  const nodesById = useMemo(() => new Map(displayNodes.map((n) => [n.id, n])), [displayNodes]);
  const groupNodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    for (const g of groups) {
      const bounds = groupBounds(g, nodesById);
      if (!bounds) continue;
      out.push({
        id: g.id,
        type: "archGroup",
        position: { x: bounds.x, y: bounds.y },
        style: { width: bounds.width, height: bounds.height },
        draggable: false,
        selectable: false,
        zIndex: -1,
        data: { label: g.label } satisfies ArchFlowGroupData,
      });
    }
    return out;
  }, [groups, nodesById]);
  const parentByNodeId = useMemo(() => {
    const map = new Map<string, { id: string; x: number; y: number }>();
    for (const g of groups) {
      const bounds = groupBounds(g, nodesById);
      if (!bounds) continue;
      for (const id of g.nodeIds) map.set(id, { id: g.id, x: bounds.x, y: bounds.y });
    }
    return map;
  }, [groups, nodesById]);

  // Group containers must precede their members in the array -- React Flow
  // requires a parent node to already be known when it processes a child
  // that references it via parentId.
  const flowNodes: Node[] = [
    ...groupNodes,
    ...displayNodes.map((n) => {
      const parent = parentByNodeId.get(n.id);
      return {
        id: n.id,
        type: "archNode",
        position: parent ? { x: n.x - parent.x, y: n.y - parent.y } : { x: n.x, y: n.y },
        parentId: parent?.id,
        draggable: false,
        selectable: false,
        data: {
          node: n,
          visualState: nodeStates.get(n.id) ?? "same",
          ghosted: current.status === "planned" && (nodeStates.get(n.id) ?? "same") !== "removed" && !builtNodeIds.has(n.id),
          reduced,
          dimmed: Boolean(selectedId) && selectedId !== n.id && !(request.on && touchedIds.has(n.id)),
          touched: request.on && touchedIds.has(n.id),
          showData,
          onSelect: setSelectedId,
        } satisfies ArchFlowNodeData,
      };
    }),
  ];

  const flowEdges: Edge[] = displayEdges.map((e) => {
    const ghosted = current.status === "planned" && current.edges.some((ce) => ce.id === e.id) && !builtEdgeIds.has(e.id);
    const onPath = Boolean(activeStep && activeStep.edge === e.id);
    return {
      id: e.id,
      source: activeStep?.reverse && onPath ? e.b : e.a,
      target: activeStep?.reverse && onPath ? e.a : e.b,
      type: "archEdge",
      data: {
        type: e.type,
        ghosted,
        onPath,
        dimmed: request.on ? !onPath : false,
        showType,
        reduced,
      } satisfies ArchFlowEdgeData,
    };
  });

  // React Flow's `fitView` prop only fits once, on mount (for whichever
  // part happened to be initial). Without this, scrubbing to a part whose
  // nodes extend further than the initially-fitted part's did leaves the
  // new nodes rendered outside the still-stale viewport -- invisible, not
  // just dimmed. Refit whenever the part or the quanta grouping (which
  // changes the layout's effective bounds) changes.
  useEffect(() => {
    fitView({ padding: 0.25, duration: reduced ? 0 : 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, showQuanta, fitView]);

  return (
    <div className={["bp-arch-explorer", className].filter(Boolean).join(" ")}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={eyebrowStyle}>Overview · Part {current.part}</span>
            <span style={chipStyle(current.status)}>{current.status === "built" ? "Built" : "Planned"}</span>
          </div>
          <div style={{ marginTop: 10, font: "400 15px/1.6 var(--font-body)", color: "var(--foreground-muted)" }}>
            {current.summary}
          </div>
        </div>
        <Toggles
          quanta={showQuanta}
          sync={showType}
          data={showData}
          onQuanta={setShowQuanta}
          onSync={setShowType}
          onData={setShowData}
        />
      </div>

      <MomentScrubber
        part={part}
        maxPart={maxPart}
        parts={parts}
        playing={scrubPlaying}
        onTogglePlay={toggleScrubPlay}
        onGoTo={goToPart}
      />

      <div
        className="bp-arch-explorer__grid"
        style={{ marginTop: 16, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "stretch" }}
      >
        <div
          className="bp-arch-explorer__canvas"
          style={{
            position: "relative",
            background: "var(--surface-sunken)",
            borderRadius: 20,
            padding: "16px 16px 12px",
            height: 480,
          }}
        >
          <Legend showType={showType} planned={current.status === "planned"} />
          <div style={{ height: "calc(100% - 28px)" }}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnScroll
              zoomOnScroll={false}
            >
              <Background gap={24} size={1} color="var(--bp-hair)" />
              <svg width={0} height={0}>
                <defs>
                  <marker id="bp-arch-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
                    <path d="M0 0L8 4L0 8z" style={{ fill: "color-mix(in oklch, var(--foreground) 32%, transparent)" }} />
                  </marker>
                </defs>
              </svg>
            </ReactFlow>
          </div>
          {request.on && activeStep ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 14,
                background: "var(--popover)",
                border: "1px solid var(--bp-hair)",
                boxShadow: "var(--shadow-ambient)",
              }}
            >
              <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--bp-accent-text)" }}>
                STEP {request.idx + 1} OF {requestSteps.length}
              </span>
              <span style={{ font: "700 13px/1.3 var(--font-body)" }}>{activeStep.caption}</span>
              <span style={{ font: "400 12.5px/1.4 var(--font-body)", color: "var(--foreground-muted)" }}>
                {activeStep.detail}
              </span>
            </div>
          ) : null}
        </div>

        <SidePanel
          node={selectedNode ?? null}
          nodeState={selectedNode ? (nodeStates.get(selectedNode.id) ?? "same") : "same"}
          onClose={() => setSelectedId(null)}
          adrTitles={adrTitles}
          adrHrefs={adrHrefs}
          part={current}
          prevPart={previous}
        />
      </div>

      <FollowRequestBar
        requestName={current.request.name}
        on={request.on}
        idx={request.idx}
        playing={request.playing}
        total={requestSteps.length}
        onStart={startRequest}
        onExit={stopRequest}
        onTogglePlay={toggleRequestPlay}
        onPrev={() => stepTo(request.idx - 1)}
        onNext={() => stepTo(request.idx + 1)}
        onStepTo={stepTo}
      />

      <ScreenReaderSummary part={current} adrTitles={adrTitles} />
    </div>
  );
}

const eyebrowStyle: CSSProperties = {
  font: "600 11px/1 var(--font-body)",
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: "var(--foreground-muted)",
};

function chipStyle(status: "built" | "planned"): CSSProperties {
  return {
    font: "600 9.5px/1 var(--font-body)",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    padding: "4px 8px",
    borderRadius: 9999,
    background: status === "built" ? "color-mix(in oklch, var(--bp-gain) 16%, transparent)" : "transparent",
    color: status === "built" ? "var(--bp-gain)" : "var(--foreground-muted)",
    border: status === "built" ? "0" : "1px dashed var(--foreground-muted)",
  };
}

function Toggles({
  quanta,
  sync,
  data,
  onQuanta,
  onSync,
  onData,
}: {
  quanta: boolean;
  sync: boolean;
  data: boolean;
  onQuanta: (v: boolean) => void;
  onSync: (v: boolean) => void;
  onData: (v: boolean) => void;
}): ReactNode {
  const items: Array<[string, boolean, (v: boolean) => void]> = [
    ["Group by quanta", quanta, onQuanta],
    ["Sync vs async", sync, onSync],
    ["Data ownership", data, onData],
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map(([label, on, set]) => (
        <button
          key={label}
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => set(!on)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: 0,
            cursor: "pointer",
            background: "var(--bp-panel)",
            color: "var(--foreground)",
            padding: "8px 14px 8px 8px",
            borderRadius: 9999,
            font: "600 13px/1 var(--font-body)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 18,
              borderRadius: 9999,
              background: on ? "var(--ember)" : "var(--bp-panel-2)",
              position: "relative",
              transition: "background 160ms",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                width: 14,
                height: 14,
                borderRadius: 9999,
                background: "var(--surface-elevated)",
                transform: on ? "translateX(12px)" : "translateX(0)",
                transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

function MomentScrubber({
  part,
  maxPart,
  parts,
  playing,
  onTogglePlay,
  onGoTo,
}: {
  part: number;
  maxPart: number;
  parts: ArchPartData[];
  playing: boolean;
  onTogglePlay: () => void;
  onGoTo: (part: number) => void;
}): ReactNode {
  return (
    <div
      role="group"
      aria-label="Series part"
      style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16 }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onGoTo(part + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onGoTo(part - 1);
        }
      }}
    >
      <button
        type="button"
        aria-label={playing ? "Pause the series" : "Play the series"}
        onClick={onTogglePlay}
        style={{
          flex: "none",
          width: 36,
          height: 36,
          border: 0,
          borderRadius: 9999,
          cursor: "pointer",
          background: "var(--ember)",
          color: "oklch(14% 0.048 238)",
          font: "700 11px/1 var(--font-mono)",
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div style={{ position: "relative", flex: 1 }}>
        <div style={{ position: "absolute", left: "8%", right: "8%", top: 8, height: 2, background: "var(--bp-hair)" }} />
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: 8,
            height: 2,
            background: "var(--ember)",
            transform: `scaleX(${((part - 1) / Math.max(1, maxPart - 1)).toFixed(3)})`,
            transformOrigin: "left center",
            transition: "transform 560ms var(--bp-spring, cubic-bezier(0.23,1,0.32,1))",
          }}
        />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${maxPart}, minmax(0, 1fr))` }}>
          {parts.map((p) => {
            const isCurrent = p.part === part;
            return (
              <button
                key={p.part}
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onGoTo(p.part)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--foreground)",
                  display: "grid",
                  justifyItems: "center",
                  gap: 6,
                  padding: "0 4px 4px",
                  textAlign: "center",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9999,
                    background: isCurrent ? "var(--ember)" : p.part < part ? "var(--foreground)" : "var(--bp-panel)",
                    border: isCurrent || p.part < part ? "0" : p.status === "planned" ? "1.5px dashed var(--foreground-muted)" : "1.5px solid var(--foreground-muted)",
                    transform: isCurrent ? "scale(1.2)" : "scale(1)",
                    transition: "transform 240ms cubic-bezier(0.16,1,0.3,1), background 240ms",
                    display: "block",
                  }}
                />
                <span style={{ font: "600 10px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>
                  PART {p.part}
                </span>
                <span style={{ font: "600 12px/1.25 var(--font-body)", color: isCurrent ? "var(--foreground)" : "var(--foreground-muted)" }}>
                  {p.status === "planned" ? "Planned" : "Built"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend({ showType, planned }: { showType: boolean; planned: boolean }): ReactNode {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, font: "500 11.5px/1 var(--font-body)", color: "var(--foreground-muted)", marginBottom: 6 }}>
      {showType ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="8" aria-hidden="true"><path d="M0 4H24" style={{ stroke: "var(--foreground-muted)" }} strokeWidth={1.25} /></svg>
            Synchronous
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="8" aria-hidden="true"><path d="M0 4H24" style={{ stroke: "var(--foreground-muted)" }} strokeWidth={1.25} strokeDasharray="4 5" /></svg>
            Asynchronous
          </span>
        </>
      ) : null}
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 16, height: 10, borderRadius: 3, border: "1px dashed var(--foreground-muted)", display: "inline-block" }} />
        External
      </span>
      {planned ? (
        <span style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.7 }}>
          <span style={{ width: 16, height: 10, borderRadius: 3, border: "1px dashed var(--foreground-muted)", display: "inline-block" }} />
          Planned, ghosted
        </span>
      ) : null}
    </div>
  );
}

function SidePanel({
  node,
  nodeState,
  onClose,
  adrTitles,
  adrHrefs,
  part,
  prevPart,
}: {
  node: ArchNodeData | null;
  nodeState: ArchNodeVisualState;
  onClose: () => void;
  adrTitles: Record<string, string>;
  adrHrefs: Record<string, string>;
  part: ArchPartData;
  prevPart: ArchPartData;
}): ReactNode {
  const panelStyle: CSSProperties = {
    background: "var(--bp-panel)",
    border: "1px solid var(--bp-hair)",
    borderRadius: 20,
    padding: 20,
    display: "flex",
    flexDirection: "column",
  };

  if (node) {
    return (
      <aside aria-label="Details" style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={eyebrowStyle}>
            {node.kind} · {node.meta}
          </span>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            style={{ width: 26, height: 26, border: 0, borderRadius: 9999, cursor: "pointer", background: "var(--bp-panel-2)", color: "var(--foreground)" }}
          >
            ✕
          </button>
        </div>
        <div style={{ marginTop: 12, font: "500 24px/1.1 var(--font-display)", letterSpacing: "-0.02em" }}>{node.label}</div>
        {nodeState === "changed" ? (
          <span style={{ marginTop: 8, alignSelf: "flex-start", font: "600 9.5px/1 var(--font-body)", letterSpacing: "0.14em", textTransform: "uppercase", padding: "4px 8px", borderRadius: 9999, background: "color-mix(in oklch, var(--ember) 16%, transparent)", color: "var(--bp-accent-text)" }}>
            Changed this part
          </span>
        ) : null}
        <div style={{ marginTop: 10, font: "400 13.5px/1.55 var(--font-body)" }}>{node.purpose}</div>
        <div style={{ marginTop: 18, ...smallEyebrow }}>Decisions</div>
        <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
          {node.adrs && node.adrs.length > 0 ? (
            node.adrs.map((id) => (
              <a key={id} href={adrHrefs[id] ?? "#"} style={{ display: "flex", gap: 8, font: "500 13px/1.4 var(--font-body)", color: "var(--foreground)", textDecoration: "none" }}>
                <span style={{ font: "600 12px/1.4 var(--font-mono)", color: "var(--bp-accent-text)" }}>{id}</span>
                <span>{adrTitles[id] ?? id}</span>
              </a>
            ))
          ) : (
            <span style={{ font: "400 13px/1.45 var(--font-body)", color: "var(--foreground-muted)" }}>
              ADR pending: written before this part ships.
            </span>
          )}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--bp-hair)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ font: "400 12px/1.4 var(--font-body)", color: "var(--foreground-muted)" }}>Cost</span>
          <span style={{ font: "500 13px/1 var(--font-mono)", color: "var(--foreground-muted)" }}>{node.costNote ?? "—"}</span>
        </div>
      </aside>
    );
  }

  const whatChanged = diffWhatChanged(prevPart, part);
  return (
    <aside aria-label="Details" style={panelStyle}>
      <div style={smallEyebrow}>What changed in Part {part.part}</div>
      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {whatChanged.length > 0 ? (
          whatChanged.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, font: "500 13.5px/1.3 var(--font-body)" }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  display: "grid",
                  placeItems: "center",
                  background: c.tone === "add" ? "color-mix(in oklch, var(--bp-gain) 16%, transparent)" : c.tone === "remove" ? "color-mix(in oklch, var(--destructive) 12%, transparent)" : "color-mix(in oklch, var(--ember) 16%, transparent)",
                  color: c.tone === "add" ? "var(--bp-gain)" : c.tone === "remove" ? "var(--destructive)" : "var(--bp-accent-text)",
                  font: "700 12px/1 var(--font-mono)",
                }}
              >
                {c.tone === "add" ? "+" : c.tone === "remove" ? "−" : "~"}
              </span>
              {c.label}
            </div>
          ))
        ) : (
          <span style={{ font: "400 13.5px/1.55 var(--font-body)", color: "var(--foreground-muted)" }}>
            Part 1 is the starting point: one deployable, one live symbol.
          </span>
        )}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 20, font: "400 12.5px/1.5 var(--font-body)", color: "var(--foreground-muted)" }}>
        Select a node for its purpose, decisions and cost.
      </div>
    </aside>
  );
}

const smallEyebrow: CSSProperties = {
  font: "600 10.5px/1 var(--font-body)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--foreground-muted)",
};

function diffWhatChanged(prev: ArchPartData, curr: ArchPartData): Array<{ id: string; label: string; tone: "add" | "remove" | "change" }> {
  if (prev.part === curr.part) return [];
  const prevIds = new Map(prev.nodes.map((n) => [n.id, n]));
  const currIds = new Set(curr.nodes.map((n) => n.id));
  const out: Array<{ id: string; label: string; tone: "add" | "remove" | "change" }> = [];
  for (const n of curr.nodes) {
    if (!prevIds.has(n.id)) out.push({ id: n.id, label: n.label, tone: "add" });
    else {
      const p = prevIds.get(n.id)!;
      if (p.purpose !== n.purpose || p.meta !== n.meta) out.push({ id: n.id, label: n.label, tone: "change" });
    }
  }
  for (const n of prev.nodes) {
    if (!currIds.has(n.id)) out.push({ id: n.id, label: n.label, tone: "remove" });
  }
  return out;
}

function FollowRequestBar({
  requestName,
  on,
  idx,
  playing,
  total,
  onStart,
  onExit,
  onTogglePlay,
  onPrev,
  onNext,
  onStepTo,
}: {
  requestName: string;
  on: boolean;
  idx: number;
  playing: boolean;
  total: number;
  onStart: () => void;
  onExit: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStepTo: (i: number) => void;
}): ReactNode {
  return (
    <div
      style={{
        marginTop: 16,
        background: "var(--bp-panel)",
        border: "1px solid var(--bp-hair)",
        borderRadius: 20,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {!on ? (
        <>
          <button
            type="button"
            onClick={onStart}
            style={{ border: 0, cursor: "pointer", padding: "11px 18px", borderRadius: 9999, background: "var(--ember)", color: "oklch(14% 0.048 238)", font: "700 13px/1 var(--font-body)" }}
          >
            ▶ Follow {requestName}
          </button>
          <span style={{ font: "400 13px/1.4 var(--font-body)", color: "var(--foreground-muted)" }}>
            Watch it travel through the current part's nodes, step by step.
          </span>
        </>
      ) : (
        <>
          <button type="button" aria-label="Previous step" onClick={onPrev} style={smallRoundBtn}>
            ◀
          </button>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={onTogglePlay}
            style={{ ...smallRoundBtn, background: "var(--ember)", color: "oklch(14% 0.048 238)" }}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button type="button" aria-label="Next step" onClick={onNext} style={smallRoundBtn}>
            ▶
          </button>
          <div style={{ flex: 1, display: "flex", gap: 4 }}>
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Step ${i + 1}`}
                onClick={() => onStepTo(i)}
                style={{ flex: 1, height: 24, border: 0, padding: 0, background: "transparent", cursor: "pointer", display: "grid", alignItems: "center" }}
              >
                <span
                  style={{
                    display: "block",
                    height: 4,
                    borderRadius: 9999,
                    background: i <= idx ? "var(--ember)" : "var(--bp-panel-2)",
                    transition: "background 240ms",
                  }}
                />
              </button>
            ))}
          </div>
          <button type="button" onClick={onExit} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--foreground-muted)", font: "600 13px/1 var(--font-body)" }}>
            Exit
          </button>
        </>
      )}
    </div>
  );
}

const smallRoundBtn: CSSProperties = {
  flex: "none",
  width: 32,
  height: 32,
  border: 0,
  borderRadius: 9999,
  cursor: "pointer",
  background: "var(--bp-panel-2)",
  color: "var(--foreground)",
  font: "700 12px/1 var(--font-mono)",
};

/** Text-list fallback for screen readers -- an SVG/React Flow canvas alone isn't meaningfully readable. */
function ScreenReaderSummary({ part, adrTitles }: { part: ArchPartData; adrTitles: Record<string, string> }): ReactNode {
  return (
    <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <h3>Part {part.part} nodes and connections</h3>
      <ul>
        {part.nodes.map((n) => (
          <li key={n.id}>
            {n.label} ({n.kind}): {n.purpose}
            {n.adrs && n.adrs.length > 0 ? ` Decisions: ${n.adrs.map((id) => `${id} ${adrTitles[id] ?? ""}`).join(", ")}.` : ""}
          </li>
        ))}
      </ul>
      <ul>
        {part.edges.map((e) => {
          const a = part.nodes.find((n) => n.id === e.a);
          const b = part.nodes.find((n) => n.id === e.b);
          return (
            <li key={e.id}>
              {a?.label ?? e.a} → {b?.label ?? e.b} ({e.type})
            </li>
          );
        })}
      </ul>
    </div>
  );
}
