import type { Edge } from "@xyflow/react";
import { facingHandles } from "../lib/facingHandles.js";
import type { ArchFlowEdgeData } from "./ArchitectureExplorerEdge.js";
import type { ArchEdgeData, ArchNodeData, ArchPartData, ArchRequestStep } from "./ArchitectureExplorer.types.js";

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

/** The lines React Flow draws: each with its state, the sides it joins at, and its caption. */
export function flowEdgesOf(input: FlowEdgeInput): Edge[] {
  const { current, builtEdgeIds, nodesById, activeStep, requestOn, showData, showType, reduced } = input;
  return input.edges.map((e) => {
    const onPath = Boolean(activeStep && activeStep.edge === e.id);
    const backwards = Boolean(activeStep?.reverse && onPath);
    return {
      id: e.id,
      source: backwards ? e.b : e.a,
      target: backwards ? e.a : e.b,
      ...sidesOf(current, nodesById, e, backwards),
      type: "archEdge",
      data: { type: e.type, ghosted: isGhosted(current, builtEdgeIds, e.id), onPath, dimmed: requestOn ? !onPath : false, showType, reduced, label: captionOf(e, showData) } satisfies ArchFlowEdgeData,
    };
  });
}
