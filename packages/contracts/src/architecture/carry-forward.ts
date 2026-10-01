/**
 * The explorer's carry-forward rule (ADR-0011). Pure: no I/O, no React, no
 * Node APIs, so the landing's loader and the explorer consistency check
 * resolve the same parts from the same function.
 *
 * What was built keeps running unless a prediction says otherwise. A node or
 * relationship of the latest built part carries into each later planned part,
 * marked `carried: true` and `builtIn: "part-0N"`, except where
 *   - that part already has the same id (the prediction wins), or
 *   - any planned moment names the id (the predictions own every id they
 *     name, so a predicted removal or replacement stays one).
 * A carried relationship also needs both of its ends present in that part.
 * Nothing is ever written into the planned CALM files.
 */

/** Marks an item that is not part of its own part's prediction but of a built one. */
export interface CarriedMark {
  carried?: true;
  /** The moment that built it, as the timeline names it, e.g. "part-01". */
  builtIn?: string;
}

export interface CarryNode extends CarriedMark {
  id: string;
  x: number;
  y: number;
}

export interface CarryEdge extends CarriedMark {
  id: string;
  a: string;
  b: string;
}

export interface CarryPart {
  part: number;
  status: "built" | "planned";
  nodes: CarryNode[];
  edges: CarryEdge[];
}

/** Every node and relationship id that a planned CALM moment names. */
export interface PlannedNames {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

/** The slice of a CALM architecture document this module reads. */
export interface CalmIds {
  nodes?: ReadonlyArray<{ "unique-id": string }>;
  relationships?: ReadonlyArray<{ "unique-id": string }>;
}

/** Collects the ids named by the planned moments (a CALM document each). */
export function plannedNamesOf(plannedDocs: ReadonlyArray<CalmIds>): PlannedNames {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const doc of plannedDocs) {
    for (const n of doc.nodes ?? []) nodes.add(n["unique-id"]);
    for (const r of doc.relationships ?? []) edges.add(r["unique-id"]);
  }
  return { nodes, edges };
}

/** "part-01" for part 1: the id the timeline gives the moment. */
export function momentIdOfPart(part: number): string {
  return `part-${String(part).padStart(2, "0")}`;
}

/** 1 for "part-01"; null when the string is not a moment id. */
export function partOfMomentId(momentId: string): number | null {
  const match = /^part-(\d{2})$/.exec(momentId);
  return match ? Number(match[1]) : null;
}

// A card is 176 x 60 in the explorer (ArchitectureExplorerNode). A carried
// card keeps its built position when that is free; otherwise it moves to a
// lane to the right of the prediction's bounds, stacked on the layouts' own
// 160px row rhythm.
const CARD_WIDTH = 176;
const CARD_HEIGHT = 60;
const CLEARANCE = 40;
const LANE_GAP = 64;
const LANE_ROW_STEP = 160;

function collides(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < CARD_WIDTH + CLEARANCE && Math.abs(a.y - b.y) < CARD_HEIGHT + CLEARANCE;
}

function place<N extends CarryNode>(carried: N[], own: CarryNode[]): N[] {
  const occupied: Array<{ x: number; y: number }> = own.map((n) => ({ x: n.x, y: n.y }));
  const placed = new Map<string, { x: number; y: number }>();

  // First pass: whatever fits where it was built stays there.
  for (const n of carried) {
    if (!occupied.some((o) => collides(o, n))) {
      occupied.push({ x: n.x, y: n.y });
      placed.set(n.id, { x: n.x, y: n.y });
    }
  }

  // Second pass: the rest go to the lane.
  const laneX = Math.max(...own.map((n) => n.x), 0) + CARD_WIDTH + LANE_GAP;
  for (const n of carried) {
    if (placed.has(n.id)) continue;
    const spot = { x: laneX, y: n.y };
    while (occupied.some((o) => collides(o, spot))) spot.y += LANE_ROW_STEP;
    occupied.push(spot);
    placed.set(n.id, spot);
  }

  return carried.map((n) => ({ ...n, ...placed.get(n.id)! }));
}

/**
 * Returns the parts with built items carried into every later planned part.
 * The latest built part before a planned one is its source, so once a later
 * part is built the carry starts from that part instead. Built parts, and
 * planned parts with no earlier built part, are returned unchanged.
 */
export function carryForward<P extends CarryPart>(parts: readonly P[], planned: PlannedNames): P[] {
  return parts.map((target) => {
    if (target.status !== "planned") return target;

    const source = parts
      .filter((p) => p.status === "built" && p.part < target.part)
      .sort((a, b) => b.part - a.part)[0];
    if (!source) return target;

    const ownNodeIds = new Set(target.nodes.map((n) => n.id));
    const ownEdgeIds = new Set(target.edges.map((e) => e.id));
    const builtIn = momentIdOfPart(source.part);

    const carriedNodes = source.nodes
      .filter((n) => !ownNodeIds.has(n.id) && !planned.nodes.has(n.id))
      .map((n) => ({ ...n, carried: true as const, builtIn }));
    const present = new Set([...ownNodeIds, ...carriedNodes.map((n) => n.id)]);
    const carriedEdges = source.edges
      .filter((e) => !ownEdgeIds.has(e.id) && !planned.edges.has(e.id) && present.has(e.a) && present.has(e.b))
      .map((e) => ({ ...e, carried: true as const, builtIn }));

    if (carriedNodes.length === 0 && carriedEdges.length === 0) return target;

    return {
      ...target,
      nodes: [...target.nodes, ...place(carriedNodes, target.nodes)],
      edges: [...target.edges, ...carriedEdges],
    };
  });
}
