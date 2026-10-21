import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdl } from "./adl.js";
import { buildDefinedView } from "./definedView.js";

const adl = loadAdl(join(import.meta.dirname, "..", ".generated", "adl.json"));

describe("buildDefinedView", () => {
  it("counts SYSTEM, COMPONENT and LIBRARY entries and their total from the parsed ADL", () => {
    const view = buildDefinedView(adl);
    expect(view.counts.map((c) => c.kind)).toEqual(["SYSTEM", "COMPONENT", "LIBRARY"]);
    expect(view.total).toBe(adl.entries.length);
    for (const c of view.counts) expect(c.count).toBe(adl.entries.filter((e) => e.kind === c.kind).length);
    expect(view.counts.reduce((sum, c) => sum + c.count, 0)).toBe(view.total);
  });
});
