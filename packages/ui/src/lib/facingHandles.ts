/** Where a node sits: the top-left of its card. */
interface Placed {
  x: number;
  y: number;
}

/**
 * For a part that reads left to right: the handles on the two sides of the nodes that face each other. Nodes that sit more across
 * than down from each other join side to side, otherwise top to bottom, so a connection never runs round the back of its own node.
 * `reversed` is a step that follows the connection from b back to a: the same two sides, with source and target swapped.
 */
export function facingHandles(a: Placed | undefined, b: Placed | undefined, reversed: boolean): { sourceHandle?: string; targetHandle?: string } {
  if (!a || !b) return {};
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const [from, to] = sidesBetween(dx, dy);
  return reversed ? { sourceHandle: `s-${to}`, targetHandle: `t-${from}` } : { sourceHandle: `s-${from}`, targetHandle: `t-${to}` };
}

/** The side a line leaves and the side it arrives at, for a displacement of (dx, dy). */
function sidesBetween(dx: number, dy: number): [string, string] {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}
