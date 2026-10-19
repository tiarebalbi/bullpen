import { describe, expect, it } from "vitest";
import { controlLabel } from "./ControlChip.js";
import { diffWhatChanged } from "./ArchitectureExplorerChanges.js";
import type { ArchNodeData, ArchPartData } from "./ArchitectureExplorer.types.js";

describe("controlLabel", () => {
  it("makes a control key readable without adding words", () => {
    expect(controlLabel("app-boundaries")).toBe("App boundaries");
    expect(controlLabel("explorer-matches-model")).toBe("Explorer matches model");
    expect(controlLabel("call-budget")).toBe("Call budget");
    expect(controlLabel("secret_containment")).toBe("Secret containment");
    expect(controlLabel("analytics")).toBe("Analytics");
  });
});

const node = (overrides: Partial<ArchNodeData> = {}): ArchNodeData => ({
  id: "n",
  label: "Name",
  kind: "service",
  meta: "Meta",
  purpose: "Does a thing.",
  x: 0,
  y: 0,
  ...overrides,
});
const part = (n: number, nodes: ArchNodeData[]): ArchPartData => ({ part: n, status: "built", summary: "s", nodes, edges: [], groups: [], request: { name: "r", steps: [] } });

describe("diffWhatChanged", () => {
  const base = part(1, [node()]);

  it("marks a node changed when its name, type, meta or purpose differs", () => {
    for (const change of [{ label: "Renamed" }, { kind: "app" as const }, { meta: "Other" }, { purpose: "Does another thing." }]) {
      expect(diffWhatChanged(base, part(2, [node(change)]))).toEqual([{ id: "n", label: change.label ?? "Name", tone: "change" }]);
    }
  });

  it("does not mark a node whose only change is its controls, which are not node data", () => {
    expect(diffWhatChanged(base, part(2, [node()]))).toEqual([]);
  });

  it("marks nodes added and removed", () => {
    expect(diffWhatChanged(base, part(2, [node({ id: "m", label: "New" })]))).toEqual([
      { id: "m", label: "New", tone: "add" },
      { id: "n", label: "Name", tone: "remove" },
    ]);
  });

  it("compares nothing for a part with itself", () => {
    expect(diffWhatChanged(base, base)).toEqual([]);
  });
});
