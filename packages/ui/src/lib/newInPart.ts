/**
 * What a moment adds to the picture: the nodes and the connections whose ids the part before it does not have. It is the set "What changed" counts as added
 * (`diffWhatChanged` takes its additions from here), so the picture's highlight and the panel's list can never disagree. The first part has nothing before it,
 * and the same part compared with itself adds nothing. Pure, and free of React, so a test can read it against the real content.
 */
export interface PartIds {
  part: number;
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<{ id: string }>;
}

export interface NewInPart {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

export function newInPart(before: PartIds, part: PartIds): NewInPart {
  if (before.part === part.part) return { nodes: new Set(), edges: new Set() };
  const hadNode = new Set(before.nodes.map((n) => n.id));
  const hadEdge = new Set(before.edges.map((e) => e.id));
  return { nodes: new Set(part.nodes.filter((n) => !hadNode.has(n.id)).map((n) => n.id)), edges: new Set(part.edges.filter((e) => !hadEdge.has(e.id)).map((e) => e.id)) };
}
