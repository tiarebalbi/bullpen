import { describe, expect, it } from "vitest";
import { controlLabel, placePopover } from "./ControlChip.js";
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

describe("placePopover", () => {
  const viewport = { width: 390, height: 844 };
  const size = { width: 320, height: 120 };

  it("goes under the chip, starting at the chip's left edge, when it fits", () => {
    expect(placePopover({ left: 40, top: 100, bottom: 126 }, size, viewport)).toEqual({ left: 40, top: 132 });
  });

  it("stays inside the viewport on the right, clamping its left edge", () => {
    const { left } = placePopover({ left: 300, top: 100, bottom: 126 }, size, viewport);
    expect(left).toBe(390 - 320 - 8);
    expect(left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("stays inside the viewport on the left", () => {
    expect(placePopover({ left: -30, top: 100, bottom: 126 }, size, viewport).left).toBe(8);
  });

  it("flips above the chip when it does not fit below", () => {
    const { top } = placePopover({ left: 40, top: 760, bottom: 786 }, size, viewport);
    expect(top).toBe(760 - 6 - 120);
    expect(top + size.height).toBeLessThanOrEqual(viewport.height - 8);
  });

  it("stays on screen when it fits neither above nor below", () => {
    const { top } = placePopover({ left: 40, top: 60, bottom: 86 }, { width: 320, height: 800 }, viewport);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + 800).toBeLessThanOrEqual(viewport.height + 8);
  });

  it("fits a viewport narrower than the popover's own width", () => {
    const { left } = placePopover({ left: 100, top: 100, bottom: 126 }, { width: 300, height: 100 }, { width: 320, height: 640 });
    expect(left).toBe(12);
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
