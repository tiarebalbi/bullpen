import type { Edge } from "@xyflow/react";
import { facingHandles } from "../lib/facingHandles.js";
import type { ArchFlowEdgeData } from "./ArchitectureExplorerEdge.js";
import type { ArchEdgeData, ArchNodeData, ArchPartData, ArchRequestStep } from "./ArchitectureExplorer.types.js";
import { carriesTraffic, rateShort } from "./ArchitectureExplorerTraffic.js";

export interface FlowEdgeInput {
  edges: ArchEdgeData[];
  current: ArchPartData;
  builtEdgeIds: Set<string>;
  nodesById: Map<string, ArchNodeData>;
  /** The request step being followed, if the request is playing. */
  activeStep: ArchRequestStep | null | undefined;
  requestOn: boolean;
  showData: boolean;
  showType: boolean;
  reduced: boolean;
  /** The traffic is paused by the reader. */
  paused: boolean;
  /** Hue of each owner while the data toggle is on, by the owner's node id: pulses take the colour of the node they leave. */
  ownerHues: Map<string, number>;
}

/** How much room fitView leaves round the picture: a part that reads left to right is wide, so it keeps less. */
export const fitPaddingOf = (current: ArchPartData): number => (current.flow === "right" ? 0.06 : 0.25);

/** Planned and not yet built: this part predicts the line and the real system does not have it. */
const isGhosted = (current: ArchPartData, builtEdgeIds: Set<string>, id: string): boolean => current.status === "planned" && current.edges.some((ce) => ce.id === id) && !builtEdgeIds.has(id);

/** The sides a line joins at: only a part that reads left to right chooses them, the others keep bottom to top. */
function sidesOf(current: ArchPartData, nodesById: Map<string, ArchNodeData>, e: ArchEdgeData, backwards: boolean): { sourceHandle?: string; targetHandle?: string } {
  return current.flow === "right" ? facingHandles(nodesById.get(e.a), nodesById.get(e.b), backwards) : {};
}

/** What is written on a line: the database role while the data toggle is on (and the line has one), else its caption. */
const captionOf = (e: ArchEdgeData, showData: boolean): string | undefined => (showData && e.label ? e.label : e.caption);

/** The node whose owner colours a line's pulses: the line's source, or the owner of the source when it is a schema. */
const pulseOwner = (e: ArchEdgeData, nodesById: Map<string, ArchNodeData>): string => nodesById.get(e.a)?.owner ?? e.a;

/** The colour a line's pulses take: its source's owner while the data toggle is on, else the ember. */
function pulseColor(e: ArchEdgeData, nodesById: Map<string, ArchNodeData>, ownerHues: Map<string, number>, showData: boolean): string {
  const hue = showData ? ownerHues.get(pulseOwner(e, nodesById)) : undefined;
  return hue === undefined ? "var(--ember)" : `oklch(66% 0.14 ${hue})`;
}

/** What is written on a line: its caption or role, and, when nothing moves, its rate, so a still picture still says how busy a line is. */
function writtenOn(e: ArchEdgeData, showData: boolean, still: boolean): string | undefined {
  const text = captionOf(e, showData);
  if (!still || !e.rate) return text;
  return text ? `${text} · ${rateShort(e.rate)}` : rateShort(e.rate);
}

/** A line's traffic: its rate, its colour, and whether it is still. A line is still when the reader asked for stillness, or when a request is being followed and the line is not on its path. */
function trafficOf(e: ArchEdgeData, ghosted: boolean, still: boolean, colour: string): ArchFlowEdgeData["traffic"] {
  return e.rate && carriesTraffic(e, ghosted) ? { rate: e.rate, color: colour, still } : undefined;
}

/** One line as React Flow draws it: its state, the sides it joins at, its caption, and its traffic when it has a rate. */
function flowEdgeOf(input: FlowEdgeInput, e: ArchEdgeData): Edge {
  const { current, builtEdgeIds, nodesById, activeStep, requestOn, showData, showType, reduced, paused, ownerHues } = input;
  const onPath = activeStep?.edge === e.id;
  const backwards = onPath && activeStep?.reverse === true;
  const ghosted = isGhosted(current, builtEdgeIds, e.id);
  const dimmed = requestOn && !onPath;
  const traffic = trafficOf(e, ghosted, reduced || paused || dimmed, pulseColor(e, nodesById, ownerHues, showData));
  const label = writtenOn(e, showData, traffic !== undefined && (reduced || paused));
  const data: ArchFlowEdgeData = { type: e.type, ghosted, onPath, dimmed, showType, reduced, label, traffic };
  return { id: e.id, source: backwards ? e.b : e.a, target: backwards ? e.a : e.b, ...sidesOf(current, nodesById, e, backwards), type: "archEdge", data };
}

/** The lines React Flow draws. */
export const flowEdgesOf = (input: FlowEdgeInput): Edge[] => input.edges.map((e) => flowEdgeOf(input, e));
