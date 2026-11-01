import { describe, expect, it } from "vitest";
import { diffWhatChanged } from "../components/ArchitectureExplorerChanges.js";
import type { ArchPartData } from "../components/ArchitectureExplorer.types.js";
import { newInPart, type PartIds } from "./newInPart.js";

const part = (n: number, nodes: string[], edges: string[]): PartIds => ({ part: n, nodes: nodes.map((id) => ({ id })), edges: edges.map((id) => ({ id })) });

describe("what a moment adds", () => {
  it("is the nodes and lines the part before does not have", () => {
    const added = newInPart(part(1, ["a", "b"], ["a-b"]), part(2, ["a", "b", "c"], ["a-b", "b-c"]));
    expect([...added.nodes]).toEqual(["c"]);
    expect([...added.edges]).toEqual(["b-c"]);
  });

  it("does not mark what is carried over from earlier, however many parts back", () => {
    const added = newInPart(part(3, ["a", "b", "c"], ["a-b", "b-c"]), part(4, ["a", "b", "c", "d"], ["a-b", "b-c", "c-d"]));
    expect([...added.nodes]).toEqual(["d"]);
    expect([...added.edges]).toEqual(["c-d"]);
  });

  it("adds nothing for the first part (it is compared with itself) or when nothing is new", () => {
    const one = part(1, ["a"], ["a-a"]);
    expect(newInPart(one, one).nodes.size + newInPart(one, one).edges.size).toBe(0);
    const same = newInPart(part(1, ["a"], []), part(2, ["a"], []));
    expect(same.nodes.size + same.edges.size).toBe(0);
  });

  it("does not count a node that was removed, or a changed one, as new", () => {
    const added = newInPart(part(1, ["a", "b"], []), part(2, ["a"], []));
    expect(added.nodes.size).toBe(0);
  });

  it("is exactly the set 'What changed' counts as added, so the picture and the panel cannot disagree", () => {
    const full = (p: PartIds): ArchPartData => ({
      part: p.part,
      status: "built",
      summary: "s",
      nodes: p.nodes.map((n, i) => ({ id: n.id, label: n.id, kind: "app", meta: "m", purpose: "p", x: i, y: 0 })),
      edges: p.edges.map((e) => ({ id: e.id, a: "a", b: "b", type: "sync" })),
      groups: [],
      request: { name: "r", steps: [] },
    });
    const [before, now] = [part(2, ["a", "b"], ["a-b"]), part(3, ["a", "b", "c", "d"], ["a-b", "c-d"])];
    const counted = diffWhatChanged(full(before), full(now)).filter((c) => c.tone === "add").map((c) => c.id).sort();
    expect(counted).toEqual([...newInPart(before, now).nodes].sort());
  });
});
