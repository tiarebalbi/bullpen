import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl } from "./adl.js";

const adlPath = join(import.meta.dirname, "..", "..", "..", "architecture", "adl", "structure.adl");

describe("parseAdl", () => {
  it("parses the real architecture/adl/structure.adl", () => {
    const content = readFileSync(adlPath, "utf8");
    const adl = parseAdl(content);

    expect(adl.entries.length).toBeGreaterThanOrEqual(4);
    expect(adl.entries).toContainEqual({ kind: "COMPONENT", name: "Landing", path: "apps/landing" });
    expect(adl.entries).toContainEqual({ kind: "COMPONENT", name: "Trading App", path: "apps/web" });
    expect(adl.rules.some((rule) => /apps NEVER DEPEND ON other apps/.test(rule))).toBe(true);
  });

  it("throws a clear error when there are no DEFINE entries", () => {
    expect(() => parseAdl("ASSERT(something)")).toThrow(/no DEFINE/);
  });

  it("throws a clear error when there are no ASSERT rules", () => {
    expect(() => parseAdl("DEFINE SYSTEM Bullpen AS bullpen")).toThrow(/no ASSERT/);
  });

  it("handles a multi-word DEFINE name correctly (greedy split on the last AS)", () => {
    const adl = parseAdl("DEFINE COMPONENT Trading App AS apps/web\nASSERT(x)");
    expect(adl.entries[0]).toEqual({ kind: "COMPONENT", name: "Trading App", path: "apps/web" });
  });
});
