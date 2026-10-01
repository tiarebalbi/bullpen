import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkAllExplorerParts, checkExplorerConsistency, resolveExplorerParts, type BuiltMoment, type CalmDocument, type ExplorerPartData } from "./explorer-consistency-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

const CALM_FIXTURE: CalmDocument = {
  nodes: [{ "unique-id": "a" }, { "unique-id": "b" }],
  relationships: [{ "unique-id": "a-to-b" }],
};

describe("checkExplorerConsistency", () => {
  it("passes when every explorer id exists in CALM and every CALM node is covered", () => {
    const explorer: ExplorerPartData = {
      part: 1,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "a-to-b" }],
    };
    expect(checkExplorerConsistency(explorer, CALM_FIXTURE)).toEqual([]);
  });

  it("flags an explorer node id that doesn't exist in CALM", () => {
    const explorer: ExplorerPartData = {
      part: 1,
      nodes: [{ id: "a" }, { id: "invented-node" }],
      edges: [],
    };
    const violations = checkExplorerConsistency(explorer, CALM_FIXTURE);
    expect(violations.some((v) => v.includes('"invented-node"') && v.includes("does not exist"))).toBe(true);
  });

  it("flags an explorer edge id that doesn't exist in CALM's relationships", () => {
    const explorer: ExplorerPartData = {
      part: 1,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "invented-edge" }],
    };
    const violations = checkExplorerConsistency(explorer, CALM_FIXTURE);
    expect(violations.some((v) => v.includes('"invented-edge"') && v.includes("does not exist"))).toBe(true);
  });

  it("flags a CALM node missing from the explorer data", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a" }], edges: [] };
    const violations = checkExplorerConsistency(explorer, CALM_FIXTURE);
    expect(violations.some((v) => v.includes('"b"') && v.includes("missing from the explorer data"))).toBe(
      true,
    );
  });
});

describe("checkAllExplorerParts", () => {
  it("passes for all six real content/architecture/part-0N.json files against their real CALM documents", () => {
    const violations = checkAllExplorerParts(repoRoot);
    expect(violations).toEqual([]);
  });
});

describe("carried items (ADR-0011)", () => {
  const BUILT: BuiltMoment[] = [
    { momentId: "part-01", part: 1, doc: { nodes: [{ "unique-id": "a" }, { "unique-id": "tool" }], relationships: [{ "unique-id": "a-to-tool" }] } },
  ];
  const PLANNED: CalmDocument = { nodes: [{ "unique-id": "a" }], relationships: [] };
  const carried = { carried: true, builtIn: "part-01" };

  it("accepts a carried node and edge that exist in the latest built moment and are marked carried", () => {
    const explorer: ExplorerPartData = {
      part: 2,
      nodes: [{ id: "a" }, { id: "tool", ...carried }],
      edges: [{ id: "a-to-tool", a: "a", b: "tool", ...carried }],
    };
    expect(checkExplorerConsistency(explorer, PLANNED, BUILT)).toEqual([]);
  });

  it("flags a carried node that is in no built moment", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "invented", ...carried }], edges: [] };
    const violations = checkExplorerConsistency(explorer, PLANNED, BUILT);
    expect(violations.some((v) => v.includes('"invented"') && v.includes("does not exist in the built moment"))).toBe(true);
  });

  it("flags a carried edge that is in no built moment", () => {
    const explorer: ExplorerPartData = {
      part: 2,
      nodes: [{ id: "a" }, { id: "tool", ...carried }],
      edges: [{ id: "invented-edge", a: "a", b: "tool", ...carried }],
    };
    expect(checkExplorerConsistency(explorer, PLANNED, BUILT).some((v) => v.includes('"invented-edge"'))).toBe(true);
  });

  it("flags a built node that is in the explorer but not marked carried", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool" }], edges: [] };
    const violations = checkExplorerConsistency(explorer, PLANNED, BUILT);
    expect(violations.some((v) => v.includes('"tool"') && v.includes("must be marked carried"))).toBe(true);
  });

  it("still flags any other node that is missing from its moment", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "invented" }], edges: [] };
    const violations = checkExplorerConsistency(explorer, PLANNED, BUILT);
    expect(violations).toEqual(['content/architecture/part-02.json: node "invented" does not exist in its CALM document']);
  });

  it("flags a carried node whose builtIn is not the latest built moment", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool", carried: true, builtIn: "part-00" }], edges: [] };
    expect(checkExplorerConsistency(explorer, PLANNED, BUILT).some((v) => v.includes("latest built moment"))).toBe(true);
  });

  it("flags a carried node that this part's own moment names, since the prediction wins", () => {
    const doc: CalmDocument = { nodes: [{ "unique-id": "a" }, { "unique-id": "tool" }], relationships: [] };
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool", ...carried }], edges: [] };
    expect(checkExplorerConsistency(explorer, doc, BUILT).some((v) => v.includes("a prediction wins"))).toBe(true);
  });

  it("flags a carried item in a part with no earlier built moment", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a", ...carried }], edges: [] };
    expect(checkExplorerConsistency(explorer, PLANNED, BUILT).some((v) => v.includes("no built moment before part 1"))).toBe(true);
  });

  it("flags a carried edge whose end is not in the part", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }], edges: [{ id: "a-to-tool", a: "a", b: "tool", ...carried }] };
    expect(checkExplorerConsistency(explorer, PLANNED, BUILT).some((v) => v.includes("has an end that is not in this part"))).toBe(true);
  });
});

describe("checkAllExplorerParts on fixtures", () => {
  const fixtures = join(__dirname, "__fixtures__");

  it("passes when the carry resolves the built tool into the planned part", () => {
    expect(checkAllExplorerParts(join(fixtures, "explorer-carry-ok"))).toEqual([]);
  });

  it("fails a hand-written carried node that is in no built moment", () => {
    const violations = checkAllExplorerParts(join(fixtures, "explorer-carry-invented"));
    expect(violations.some((v) => v.includes('"invented-tool"') && v.includes("does not exist in the built moment"))).toBe(true);
  });

  it("leaves a predicted replacement alone once its part is built: planned/part-02 still names what Part 3 replaces", () => {
    const root = join(fixtures, "explorer-carry-built-part2");
    expect(checkAllExplorerParts(root)).toEqual([]);
    const part3 = resolveExplorerParts(root).parts.find((p) => p.part === 3)!;
    // The built Part 2 has old-service and tool. Only tool carries: planned/part-02
    // names old-service, so the prediction for Part 3 (which omits it) stands.
    expect(part3.nodes.filter((n) => n.carried).map((n) => [n.id, n.builtIn])).toEqual([["tool", "part-02"]]);
  });
});
