import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPLORER_RULE,
  calmPathForPart,
  checkAllExplorerParts,
  checkExplorerConsistency,
  type CalmDocument,
  type ExplorerPartData,
} from "./explorer-consistency-check.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

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
    const [violation] = checkExplorerConsistency(explorer, CALM_FIXTURE, "architecture/calm/moments/part-01.architecture.json");

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

describe("calmPathForPart", () => {
  it("prefers the real moment over the planned one once a part has been built", () => {
    const root = mkdtempSync(join(tmpdir(), "explorer-paths-"));
    mkdirSync(join(root, "architecture", "calm", "moments"), { recursive: true });
    mkdirSync(join(root, "architecture", "calm", "planned"), { recursive: true });
    writeFileSync(join(root, "architecture/calm/planned/part-02.architecture.json"), "{}");
    expect(calmPathForPart(root, 2)).toBe("architecture/calm/planned/part-02.architecture.json");

    writeFileSync(join(root, "architecture/calm/moments/part-02.architecture.json"), "{}");
    expect(calmPathForPart(root, 2)).toBe("architecture/calm/moments/part-02.architecture.json");
    expect(calmPathForPart(root, 3)).toBeUndefined();
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

  it("reports a missing explorer file as a violation with a relative path", () => {
    const root = mkdtempSync(join(tmpdir(), "explorer-empty-"));
    const violations = checkAllExplorerParts(root);
    expect(violations).toHaveLength(6);
    expectFailureFormat(violations[0]!, "explorer consistency");
  });
});
