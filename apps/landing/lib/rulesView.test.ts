import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdl } from "./adl.js";
import { buildRulesTabData, part1RuleIds, ruleSince } from "./rulesView.js";
import { loadLatestRulesSnapshot } from "./rulesSnapshot.js";

const landingRoot = join(import.meta.dirname, "..");
const repoRoot = join(landingRoot, "..", "..");
const adl = loadAdl(join(landingRoot, ".generated", "adl.json"));
const idOf = (text: string): string => adl.rules.find((rule) => rule.text === text)!.id;

describe("ruleSince", () => {
  it("dates the two structural asserts and the two that keep the apps apart to Part 1, by id", () => {
    expect(ruleSince(idOf("every directory under apps and packages is DEFINED"), "structure")).toBe(1);
    expect(ruleSince(idOf("every DEFINED COMPONENT and LIBRARY exists as a directory"), "structure")).toBe(1);
    expect(ruleSince(idOf("Landing HAS NO DEPENDENCY ON Trading App"), "turbo boundaries")).toBe(1);
    expect(ruleSince(idOf("Trading App HAS NO DEPENDENCY ON Landing"), "turbo boundaries")).toBe(1);
  });

  it("dates the rules Part 2 added, and the budget and explorer checks that already ran in Part 1", () => {
    expect(ruleSince(idOf("UI HAS NO DEPENDENCY ON Landing, Trading App"), "turbo boundaries")).toBe(2);
    expect(ruleSince(idOf("Landing IS DEPENDENT ON UI, Contracts"), "turbo boundaries")).toBe(2);
    expect(ruleSince("anything", "secret containment")).toBe(2);
    expect(ruleSince("anything", "budget")).toBe(1);
    expect(ruleSince("anything", "explorer consistency")).toBe(1);
  });

  it("holds the Part 1 ids to rules the real ADL states, so a reworded rule cannot silently become a Part 2 rule", () => {
    const stated = new Set(adl.rules.map((rule) => rule.id));
    for (const id of part1RuleIds()) expect(stated.has(id), `${id} is not in structure.adl`).toBe(true);
    expect(adl.rules.filter((rule) => ruleSince(rule.id, "x") === 1)).toHaveLength(4);
  });
});

describe("buildRulesTabData", () => {
  it("has nothing to show without a snapshot", () => {
    expect(buildRulesTabData(null, adl)).toEqual({ snapshot: null, rows: [], commands: [] });
  });

  it("lists every rule of the committed snapshot with its id, check and result, and the ASSERT line for the ADL's own", () => {
    const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"));
    expect(snapshot).not.toBeNull();
    const data = buildRulesTabData(snapshot, adl);

    expect(data.snapshot).toMatchObject({ part: 2, commit: snapshot!.commit });
    expect(data.rows.map((row) => row.id)).toEqual(expect.arrayContaining(adl.rules.map((rule) => rule.id)));
    for (const rule of adl.rules) {
      const row = data.rows.find((candidate) => candidate.id === rule.id)!;
      expect(row.rule).toBe(rule.text);
      expect(row.line!.raw).toBe(`ASSERT(${rule.text})`);
    }
    expect(data.rows.filter((row) => row.line === null).every((row) => !adl.rules.some((rule) => rule.id === row.id))).toBe(true);
    expect(data.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["check:arch", "turbo boundaries"]));
  });
});
