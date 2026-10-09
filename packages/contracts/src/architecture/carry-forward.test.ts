import { describe, expect, it } from "vitest";
import { carryForward, momentIdOfPart, partOfMomentId, plannedNamesOf, type CarryPart, type PlannedNames } from "./carry-forward.js";

const node = (id: string, x = 0, y = 0) => ({ id, x, y });
const edge = (id: string, a: string, b: string) => ({ id, a, b });
const part = (n: number, status: "built" | "planned", nodes: string[], edges: Array<[string, string, string]> = []): CarryPart => ({
  part: n,
  status,
  nodes: nodes.map((id, i) => node(id, i * 400, 0)),
  edges: edges.map(([id, a, b]) => edge(id, a, b)),
});
const none: PlannedNames = { nodes: new Set(), edges: new Set() };
const ids = (p: CarryPart | undefined) => p!.nodes.map((n) => n.id);
const carriedIds = (p: CarryPart | undefined) => p!.nodes.filter((n) => n.carried).map((n) => n.id);

describe("carryForward", () => {
  const built = part(1, "built", ["app", "tool"], [["app-to-tool", "app", "tool"]]);

  it("carries a built node and its relationship into every later planned part", () => {
    const parts = [built, part(2, "planned", ["app"]), part(3, "planned", ["app"]), part(4, "planned", ["app"])];
    const out = carryForward(parts, none);
    for (const later of out.slice(1)) {
      expect(carriedIds(later)).toEqual(["tool"]);
      expect(later.edges.map((e) => [e.id, e.carried, e.builtIn])).toEqual([["app-to-tool", true, "part-01"]]);
      expect(later.nodes.find((n) => n.id === "tool")).toMatchObject({ carried: true, builtIn: "part-01" });
    }
  });

  it("leaves the built part and its own, uncarried items alone", () => {
    const out = carryForward([built, part(2, "planned", ["app"])], none);
    expect(out[0]).toBe(built);
    expect(out[1]!.nodes.find((n) => n.id === "app")?.carried).toBeUndefined();
  });

  it("lets a prediction override a carried node with the same id", () => {
    const predicted = part(2, "planned", ["app", "tool"]);
    const out = carryForward([built, predicted], none);
    expect(carriedIds(out[1])).toEqual([]);
    expect(out[1]!.nodes.find((n) => n.id === "tool")).toBe(predicted.nodes[1]);
  });

  it("does not carry an id that any planned moment names, so a predicted removal stays removed", () => {
    const planned = plannedNamesOf([{ nodes: [{ "unique-id": "tool" }], relationships: [{ "unique-id": "app-to-tool" }] }]);
    const out = carryForward([built, part(2, "planned", ["app"]), part(3, "planned", ["app", "tool"])], planned);
    expect(ids(out[1])).toEqual(["app"]);
    expect(out[1]!.edges).toEqual([]);
  });

  it("does not carry a relationship that a planned moment names, even when its ends are present", () => {
    const planned: PlannedNames = { nodes: new Set(), edges: new Set(["app-to-tool"]) };
    const out = carryForward([built, part(2, "planned", ["app"])], planned);
    expect(carriedIds(out[1])).toEqual(["tool"]);
    expect(out[1]!.edges).toEqual([]);
  });

  it("carries a relationship only when both of its ends exist in that part", () => {
    const parts = [
      part(1, "built", ["a", "b", "c"], [["a-to-b", "a", "b"], ["b-to-c", "b", "c"]]),
      part(2, "planned", ["a"]),
    ];
    // b and c carry, so both edges have both ends...
    expect(carryForward(parts, none)[1]!.edges.map((e) => e.id)).toEqual(["a-to-b", "b-to-c"]);
    // ...but with b named by a prediction (and so absent here), neither does.
    const planned: PlannedNames = { nodes: new Set(["b"]), edges: new Set() };
    const out = carryForward(parts, planned);
    expect(carriedIds(out[1])).toEqual(["c"]);
    expect(out[1]!.edges).toEqual([]);
  });

  it("carries a relationship whose end is a predicted node in that part", () => {
    const out = carryForward([built, part(2, "planned", ["app"])], none);
    expect(out[1]!.edges.map((e) => e.id)).toEqual(["app-to-tool"]);
  });

  it("starts from a later built part once there is one", () => {
    const part2 = part(2, "built", ["app", "tool", "explorer"], [["app-to-tool", "app", "tool"]]);
    const dropped = part(2, "built", ["app", "explorer"]);

    const out = carryForward([built, part2, part(3, "planned", ["app"]), part(4, "planned", ["app"])], none);
    expect(carriedIds(out[2])).toEqual(["tool", "explorer"]);
    expect(out[2]!.nodes.find((n) => n.id === "tool")?.builtIn).toBe("part-02");
    expect(out[3]!.nodes.every((n) => !n.carried || n.builtIn === "part-02")).toBe(true);

    // What Part 2 no longer has is not resurrected from Part 1.
    const afterDrop = carryForward([built, dropped, part(3, "planned", ["app"])], none);
    expect(carriedIds(afterDrop[2])).toEqual(["explorer"]);
  });

  it("carries nothing when there is no earlier built part", () => {
    const planned = part(2, "planned", ["app"]);
    expect(carryForward([planned], none)[0]).toBe(planned);
  });

  it("does not mutate its input", () => {
    const planned = part(2, "planned", ["app"]);
    const before = JSON.stringify([built, planned]);
    carryForward([built, planned], none);
    expect(JSON.stringify([built, planned])).toBe(before);
  });

  describe("placement", () => {
    it("keeps the built position when the prediction leaves it free", () => {
      const out = carryForward([{ ...built, nodes: [node("app", 0, 0), node("tool", 0, 400)] }, part(2, "planned", ["app"])], none);
      expect(out[1]!.nodes.find((n) => n.id === "tool")).toMatchObject({ x: 0, y: 400 });
    });

    it("moves to a lane right of the prediction when the built position is taken", () => {
      const source: CarryPart = { ...built, nodes: [node("app", 0, 0), node("tool", 600, 400)] };
      const predicted: CarryPart = { ...part(2, "planned", ["app"]), nodes: [node("app", 0, 0), node("other", 540, 400)] };
      const tool = carryForward([source, predicted], none)[1]!.nodes.find((n) => n.id === "tool")!;
      expect(tool.x).toBeGreaterThan(540 + 176);
      expect(tool.y).toBe(400);
    });

    it("stacks several laned cards instead of overlapping them", () => {
      const source: CarryPart = { ...built, nodes: [node("app", 0, 0), node("t1", 600, 400), node("t2", 640, 400)] };
      const predicted: CarryPart = { ...part(2, "planned", ["app"]), nodes: [node("app", 0, 0), node("other", 560, 380)] };
      const [t1, t2] = ["t1", "t2"].map((id) => carryForward([source, predicted], none)[1]!.nodes.find((n) => n.id === id)!);
      expect(t1!.x).toBe(t2!.x);
      expect(Math.abs(t1!.y - t2!.y)).toBeGreaterThanOrEqual(60);
    });
  });
});

describe("plannedNamesOf", () => {
  it("collects node and relationship ids across documents", () => {
    const names = plannedNamesOf([
      { nodes: [{ "unique-id": "a" }], relationships: [{ "unique-id": "a-to-b" }] },
      { nodes: [{ "unique-id": "b" }] },
    ]);
    expect([...names.nodes]).toEqual(["a", "b"]);
    expect([...names.edges]).toEqual(["a-to-b"]);
  });
});

describe("moment ids", () => {
  it("round-trips part numbers", () => {
    expect(momentIdOfPart(1)).toBe("part-01");
    expect(partOfMomentId("part-06")).toBe(6);
    expect(partOfMomentId("moment-1")).toBeNull();
  });
});
