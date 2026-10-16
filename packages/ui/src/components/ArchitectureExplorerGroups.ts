import type { Node } from "@xyflow/react";
import type { ArchFlowGroupData } from "./ArchitectureExplorerGroup.js";
import type { ArchGroupData, ArchNodeData } from "./ArchitectureExplorer.types.js";

const GROUP_NODE_WIDTH = 176;
const GROUP_NODE_HEIGHT = 60;
const GROUP_PAD = 24;

/** Bounding box (in the same absolute coordinate space as node.x/y) around a group's real member nodes. */
export function groupBounds(group: ArchGroupData, nodesById: Map<string, ArchNodeData>): { x: number; y: number; width: number; height: number } | null {
  const members = group.nodeIds.map((id) => nodesById.get(id)).filter((n): n is ArchNodeData => Boolean(n));
  if (members.length === 0) return null;
  const x0 = Math.min(...members.map((n) => n.x)) - GROUP_PAD;
  const y0 = Math.min(...members.map((n) => n.y)) - GROUP_PAD - 16;
  const x1 = Math.max(...members.map((n) => n.x + GROUP_NODE_WIDTH)) + GROUP_PAD;
  const y1 = Math.max(...members.map((n) => n.y + GROUP_NODE_HEIGHT)) + GROUP_PAD;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The groups to draw. A box that is a node (the database) is not a quanta group: it stays when the grouping is switched off,
 * because it is the database.
 */
export const groupsToDraw = (groups: ArchGroupData[], showQuanta: boolean): ArchGroupData[] => (showQuanta ? groups : groups.filter((g) => g.nodeId));

/** The ids of the nodes that are drawn as boxes, not as cards. */
export const boxNodeIdsOf = (groups: ArchGroupData[]): Set<string> => new Set(groups.flatMap((g) => (g.nodeId ? [g.nodeId] : [])));

/** Each group as a React Flow node: a real node, so its box pans and zooms with the canvas, with its members positioned inside it. */
export function groupFlowNodes(groups: ArchGroupData[], nodesById: Map<string, ArchNodeData>, selectedId: string | null, onSelect: (id: string) => void): Node[] {
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
      data: { label: g.label, nodeId: g.nodeId, selected: g.nodeId === selectedId, onSelect } satisfies ArchFlowGroupData,
    });
  }
  return out;
}

/** The nodes drawn as cards: every node but the ones that are drawn as boxes. */
export const cardNodesOf = (nodes: ArchNodeData[], groups: ArchGroupData[]): ArchNodeData[] => {
  const boxes = boxNodeIdsOf(groups);
  return nodes.filter((n) => !boxes.has(n.id));
};
