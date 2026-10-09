import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPLORER_RULE,
  checkAllExplorerParts,
  checkExplorerConsistency,
  resolveExplorerParts,
  type BuiltMoment,
  type CalmDocument,
  type ExplorerPartData,
} from "./explorer-consistency-check.js";
import { expectFailureFormat, fixturesRoot, realRepoRoot } from "./test-helpers.js";
import type { Violation } from "./violation.js";

const whys = (violations: Violation[]): string[] => violations.map((v) => v.why);

const CALM_FIXTURE: CalmDocument = {
  nodes: [{ "unique-id": "a" }, { "unique-id": "b" }],
  relationships: [{ "unique-id": "a-to-b" }],
};

describe("checkExplorerConsistency", () => {
  it("passes when every explorer id exists in CALM and every CALM node is covered", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a" }, { id: "b" }], edges: [{ id: "a-to-b" }] };
    expect(checkExplorerConsistency(explorer, CALM_FIXTURE)).toEqual([]);
  });

  it("flags an explorer node id that doesn't exist in CALM", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a" }, { id: "b" }, { id: "invented-node" }], edges: [] };
    const [violation] = checkExplorerConsistency(explorer, CALM_FIXTURE, [], "architecture/calm/moments/part-01.architecture.json");

    expect(violation!.why).toContain('node "invented-node"');
    expect(violation!.where).toBe("content/architecture/part-01.json");
    expect(violation!.fix).toContain("Remove");
  });

  it("flags an explorer edge id that doesn't exist in CALM's relationships", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a" }, { id: "b" }], edges: [{ id: "invented-edge" }] };
    const [violation] = checkExplorerConsistency(explorer, CALM_FIXTURE);
    expect(violation!.why).toContain('edge "invented-edge"');
  });

  it("flags a CALM node missing from the explorer data", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a" }], edges: [] };
    const [violation] = checkExplorerConsistency(explorer, CALM_FIXTURE);
    expect(violation!.why).toContain('node "b"');
    expect(violation!.why).toContain("does not draw");
  });

  it("fails in the shared format, citing ADR-0006", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }], edges: [] };
    const text = expectFailureFormat(checkExplorerConsistency(explorer, CALM_FIXTURE)[0]!, "explorer consistency");
    expect(text).toContain(`✗ explorer consistency: ${EXPLORER_RULE}`);
    expect(text).toContain("content/architecture/part-02.json");
    expect(text).toContain("(ADR-0006)");
  });
});

describe("preferring the built moment over the prediction", () => {
  const read = (relative: string) => JSON.parse(readFileSync(join(realRepoRoot, relative), "utf8"));
  const content = read("content/architecture/part-02.json") as ExplorerPartData;

  it("holds Part 2's content to what was built", () => {
    expect(checkExplorerConsistency(content, read("architecture/calm/moments/part-02.architecture.json") as CalmDocument)).toEqual([]);
  });

  it("would not hold it to the prediction: it differs from it only by the analytics ADR-0010 added after the prediction was written", () => {
    const violations = checkExplorerConsistency(content, read("architecture/calm/planned/part-02.architecture.json") as CalmDocument);
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) expect(violation.why).toMatch(/google-analytics|microsoft-clarity/);
  });
});

describe("checkAllExplorerParts", () => {
  it("passes for all six real content/architecture/part-0N.json files against their real CALM documents", () => {
    expect(checkAllExplorerParts(realRepoRoot)).toEqual([]);
  });

  it("reports a missing explorer file as a violation with a relative path, one per part, and a missing timeline", () => {
    const root = mkdtempSync(join(tmpdir(), "explorer-empty-"));
    const violations = checkAllExplorerParts(root);
    expect(violations.filter((v) => v.why.includes("has no explorer content file"))).toHaveLength(6);
    expect(violations.some((v) => v.where === "architecture/calm/bullpen.timeline.json")).toBe(true);
    for (const violation of violations) expectFailureFormat(violation, "explorer consistency");
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
    const violations = whys(checkExplorerConsistency(explorer, PLANNED, BUILT));
    expect(violations.some((v) => v.includes('"invented"') && v.includes("does not exist in the built moment"))).toBe(true);
  });

  it("flags a carried edge that is in no built moment", () => {
    const explorer: ExplorerPartData = {
      part: 2,
      nodes: [{ id: "a" }, { id: "tool", ...carried }],
      edges: [{ id: "invented-edge", a: "a", b: "tool", ...carried }],
    };
    expect(whys(checkExplorerConsistency(explorer, PLANNED, BUILT)).some((v) => v.includes('"invented-edge"'))).toBe(true);
  });

  it("flags a built node that is in the explorer but not marked carried", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool" }], edges: [] };
    const violations = whys(checkExplorerConsistency(explorer, PLANNED, BUILT));
    expect(violations.some((v) => v.includes('"tool"') && v.includes("must be marked carried"))).toBe(true);
  });

  it("still flags any other node that is missing from its moment", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "invented" }], edges: [] };
    const violations = whys(checkExplorerConsistency(explorer, PLANNED, BUILT));
    expect(violations).toEqual([
      'The explorer draws node "invented", which its CALM document does not have: it does not exist in its CALM document (ADR-0006).',
    ]);
  });

  it("flags a carried node whose builtIn is not the earliest built moment that contains it", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool", carried: true, builtIn: "part-00" }], edges: [] };
    expect(whys(checkExplorerConsistency(explorer, PLANNED, BUILT)).some((v) => v.includes('the earliest built moment that contains it is "part-01"'))).toBe(true);
  });

  describe("with two built moments", () => {
    const TWO: BuiltMoment[] = [
      ...BUILT,
      { momentId: "part-02", part: 2, doc: { nodes: [{ "unique-id": "a" }, { "unique-id": "tool" }, { "unique-id": "later" }], relationships: [{ "unique-id": "a-to-tool" }] } },
    ];
    const PART3: CalmDocument = { nodes: [{ "unique-id": "a" }], relationships: [] };

    it("accepts an item carried with the moment that first built it, though it is copied from the latest", () => {
      const explorer: ExplorerPartData = {
        part: 3,
        nodes: [{ id: "a" }, { id: "tool", carried: true, builtIn: "part-01" }, { id: "later", carried: true, builtIn: "part-02" }],
        edges: [{ id: "a-to-tool", a: "a", b: "tool", carried: true, builtIn: "part-01" }],
      };
      expect(checkExplorerConsistency(explorer, PART3, TWO)).toEqual([]);
    });

    it("flags an item Part 1 already has when it is marked builtIn part-02, and names part-01", () => {
      const explorer: ExplorerPartData = { part: 3, nodes: [{ id: "a" }, { id: "tool", carried: true, builtIn: "part-02" }], edges: [] };
      expect(whys(checkExplorerConsistency(explorer, PART3, TWO))).toEqual([
        'node "tool" is carried with builtIn "part-02", but the earliest built moment that contains it is "part-01" (ADR-0011).',
      ]);
    });

    it("flags a carried edge marked with the latest moment when an earlier one built it", () => {
      const explorer: ExplorerPartData = {
        part: 3,
        nodes: [{ id: "a" }, { id: "tool", carried: true, builtIn: "part-01" }],
        edges: [{ id: "a-to-tool", a: "a", b: "tool", carried: true, builtIn: "part-02" }],
      };
      expect(whys(checkExplorerConsistency(explorer, PART3, TWO)).some((v) => v.includes('edge "a-to-tool"') && v.includes('is "part-01"'))).toBe(true);
    });
  });

  it("flags a carried node that this part's own moment names, since the prediction wins", () => {
    const doc: CalmDocument = { nodes: [{ "unique-id": "a" }, { "unique-id": "tool" }], relationships: [] };
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }, { id: "tool", ...carried }], edges: [] };
    expect(whys(checkExplorerConsistency(explorer, doc, BUILT)).some((v) => v.includes("a prediction wins"))).toBe(true);
  });

  it("flags a carried item in a part with no earlier built moment", () => {
    const explorer: ExplorerPartData = { part: 1, nodes: [{ id: "a", ...carried }], edges: [] };
    expect(whys(checkExplorerConsistency(explorer, PLANNED, BUILT)).some((v) => v.includes("no built moment before part 1"))).toBe(true);
  });

  it("flags a carried edge whose end is not in the part", () => {
    const explorer: ExplorerPartData = { part: 2, nodes: [{ id: "a" }], edges: [{ id: "a-to-tool", a: "a", b: "tool", ...carried }] };
    expect(whys(checkExplorerConsistency(explorer, PLANNED, BUILT)).some((v) => v.includes("has an end that is not in this part"))).toBe(true);
  });
});

describe("checkAllExplorerParts on fixtures", () => {
  const fixtures = fixturesRoot;

  it("passes when the carry resolves the built tool into the planned part", () => {
    expect(checkAllExplorerParts(join(fixtures, "explorer-carry-ok"))).toEqual([]);
  });

  it("fails a hand-written carried node that is in no built moment", () => {
    const violations = whys(checkAllExplorerParts(join(fixtures, "explorer-carry-invented")));
    expect(violations.some((v) => v.includes('"invented-tool"') && v.includes("does not exist in the built moment"))).toBe(true);
  });

  it("fails a hand-written carried node marked with the moment it was copied from, when an earlier moment first built it", () => {
    const violations = checkAllExplorerParts(join(fixtures, "explorer-carry-first-built-elsewhere"));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ where: "content/architecture/part-03.json" });
    expect(violations[0]!.why).toBe(
      'node "tool" is carried with builtIn "part-02", but the earliest built moment that contains it is "part-01" (ADR-0011).',
    );
    expectFailureFormat(violations[0]!, "explorer consistency");
  });

  it("leaves a predicted replacement alone once its part is built: planned/part-02 still names what Part 3 replaces", () => {
    const root = join(fixtures, "explorer-carry-built-part2");
    expect(checkAllExplorerParts(root)).toEqual([]);
    const part3 = resolveExplorerParts(root).parts.find((p) => p.part === 3)!;
    // The built Part 2 has old-service and tool. Only tool carries: planned/part-02
    // names old-service, so the prediction for Part 3 (which omits it) stands.
    expect(part3.nodes.filter((n) => n.carried).map((n) => [n.id, n.builtIn])).toEqual([["tool", "part-02"]]); // first built in Part 2
  });
});
