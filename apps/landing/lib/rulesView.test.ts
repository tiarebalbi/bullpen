import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl } from "./adl.js";
import { buildRulesTabData, ruleSince } from "./rulesView.js";
import { loadLatestRulesSnapshot } from "./rulesSnapshot.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adl = parseAdl(readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8"));

describe("ruleSince", () => {
  it("dates the three original ADL rules, the budget and the explorer check to Part 1, and the rest to Part 2", () => {
    expect(ruleSince(adl.rules[0]!, "structure")).toBe(1);
    expect(ruleSince(adl.rules[1]!, "structure")).toBe(1);
    expect(ruleSince(adl.rules[2]!, "turbo boundaries")).toBe(1);
    expect(ruleSince("anything", "budget")).toBe(1);
    expect(ruleSince("anything", "explorer consistency")).toBe(1);
    expect(ruleSince("libraries NEVER DEPEND ON apps", "turbo boundaries")).toBe(2);
    expect(ruleSince("anything", "secret containment")).toBe(2);
  });

  it("uses the ADL's own wording for the rules it dates to Part 1", () => {
    expect(adl.rules.slice(0, 3).map((rule) => ruleSince(rule, "x"))).toEqual([1, 1, 1]);
    expect(adl.rules.slice(3).every((rule) => ruleSince(rule, "x") === 2)).toBe(true);
  });
});

describe("buildRulesTabData", () => {
  it("has nothing to show without a snapshot", () => {
    expect(buildRulesTabData(null)).toEqual({ snapshot: null, rows: [], commands: [] });
  });

  it("lists every rule of the committed snapshot with its check and result", () => {
    const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"));
    expect(snapshot).not.toBeNull();
    const data = buildRulesTabData(snapshot);

    expect(data.snapshot).toMatchObject({ part: 2, commit: snapshot!.commit });
    expect(data.rows.map((row) => row.rule)).toEqual(expect.arrayContaining(adl.rules));
    expect(data.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["check:arch", "turbo boundaries"]));
  });
});
