import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkAllExplorerParts, checkExplorerConsistency, type CalmDocument, type ExplorerPartData } from "./explorer-consistency-check.js";

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
