import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdl } from "./adl.js";
import { parseAllowances } from "./cost.js";
import { buildRuleTiles } from "./ruleTiles.js";
import { loadLatestRulesSnapshot, type RulesSnapshot, type SnapshotRule } from "./rulesSnapshot.js";

const landingRoot = join(import.meta.dirname, "..");
const repoRoot = join(landingRoot, "..", "..");
const adl = loadAdl(join(landingRoot, ".generated", "adl.json"));
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));
const real = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"))!;

/** The extra rules the checks enforce without an ASSERT line: one per family the mapping names. */
const EXTRAS: SnapshotRule[] = [
  { id: "x-model-1", rule: "every external system is decided", check: "model currency", passed: true },
  { id: "x-model-2", rule: "every ADR is linked", check: "model currency", passed: true },
  { id: "x-explorer", rule: "the explorer matches the model", check: "explorer consistency", passed: true },
  { id: "x-migration", rule: "a migration touches only its owner's schema", check: "data ownership", passed: true },
  { id: "x-coverage", rule: "every ADL ASSERT is enforced", check: "rule coverage", passed: true },
  { id: "x-email", rule: "no email in files", check: "email in files", passed: true },
  { id: "x-web-url", rule: "production links to the trading app's domain", check: "web url", passed: true },
  { id: "x-budget", rule: "the budget holds", check: "budget", passed: true },
];

function snapshot(options: { failing?: string[]; extras?: SnapshotRule[]; calm?: boolean } = {}): RulesSnapshot {
  const rules: SnapshotRule[] = adl.rules.map((rule) => ({ id: rule.id, rule: rule.text, check: "check", passed: !(options.failing ?? []).includes(rule.id) }));
  return {
    schema: 2, part: 3, generatedAt: "2026-10-13T16:28:46.703Z", commit: "7bf8a5d7e768c18209ac62e99ebc07fdcde05ccf", dirty: false, ref: "t", source: "local", passed: true,
    checks: [
      { id: "check-arch", name: "check:arch", command: "x", passed: true, summary: "", raw: "a.txt", rules: [...rules, ...(options.extras ?? EXTRAS)] },
      { id: "calm-part-01", name: "calm validate (part-01)", command: "x", passed: options.calm ?? true, summary: "", raw: "c.json", rules: [] },
    ],
  };
}

describe("buildRuleTiles", () => {
  const view = buildRuleTiles(adl, allowances, snapshot());

  it("makes one tile per # heading of structure.adl, then the CALM model and the free-tier budget: eight tiles", () => {
    expect(view.tiles).toHaveLength(8);
    expect(view.tiles.slice(0, -2).map((t) => t.title)).toEqual(adl.groups.map((g) => g.heading.replace(/\s*\(.+\)$/, "")));
    expect(view.tiles.slice(-2).map((t) => [t.id, t.countLabel])).toEqual([["calm", "CLI check"], ["budget", "Fitness function"]]);
  });

  it("adds up: the tile counts sum to the headline total, and the headline is passing/total", () => {
    expect(view.tiles.reduce((sum, t) => sum + t.count, 0)).toBe(view.total);
    expect(view.total).toBe(adl.rules.length + EXTRAS.length);
    expect(view.ratio).toBe(`${view.total}/${view.total}`);
  });

  it("lists each non-ADL rule inside the tile of its family, apart from the ASSERT lines, and counts it", () => {
    const tile = (title: string) => view.tiles.find((t) => t.title === title)!;
    expect(tile("Model currency").extraRows.map((r) => r.key)).toEqual(["x-model-1", "x-model-2", "x-explorer"]);
    expect(tile("Data ownership").extraRows.map((r) => r.key)).toEqual(["x-migration"]);
    expect(tile("Structural assertions").extraRows.map((r) => r.key)).toEqual(["x-coverage"]);
    expect(tile("Entry points and secrets").extraRows.map((r) => r.key)).toEqual(["x-email", "x-web-url"]);
    expect(tile("Allowed dependencies").extraRows).toEqual([]);
    expect(tile("Model currency").count).toBe(tile("Model currency").rows.length + 3);
    expect(view.tiles.find((t) => t.id === "budget")!.count).toBe(1);
  });

  it("shows ASSERT lines as written, with the parser's tokens and their line numbers", () => {
    const group = adl.groups.find((g) => g.heading === "Allowed dependencies")!;
    const tile = view.tiles.find((t) => t.title === "Allowed dependencies")!;
    expect(tile.head).toBe("# Allowed dependencies");
    expect(tile.rows.map((r) => r.line)).toEqual(group.ruleIds.map((id) => adl.rules.find((r) => r.id === id)!.line));
    for (const row of tile.rows) expect(row.tokens!.map((t) => t.text).join("").trim()).toBe(row.text);
  });

  it("marks a failing rule on its row and on its tile, and nowhere else", () => {
    const rule = adl.groups.find((g) => g.heading === "Data ownership")!.ruleIds[0]!;
    const failed = buildRuleTiles(adl, allowances, snapshot({ failing: [rule] }));
    expect(failed.tiles.filter((t) => t.passed === false).map((t) => t.title)).toEqual(["Data ownership"]);
    expect(failed.passing).toBe(failed.total - 1);
    expect(failed.ratio).toBe(`${failed.total - 1}/${failed.total}`);
  });

  it("says no result, not pass, for every tile when there is no snapshot", () => {
    const none = buildRuleTiles(adl, allowances, null);
    expect(none.ratio).toBe("");
    expect(none.stamp).toBeNull();
    for (const tile of none.tiles) {
      expect(tile.passed).toBeNull();
      expect(tile.result).toBe("no snapshot yet");
    }
  });

  it("fails the build for a rule from a check no tile holds, rather than leaving it out of the headline", () => {
    const stray: SnapshotRule = { id: "x-new", rule: "a new rule", check: "a brand new check", passed: true };
    expect(() => buildRuleTiles(adl, allowances, snapshot({ extras: [...EXTRAS, stray] }))).toThrow(/a brand new check.*EXTRA_RULE_TILE/s);
  });

  it("does not count an ASSERT the snapshot has no result for, and shows it as no result", () => {
    const rule = adl.rules[0]!;
    const older = snapshot();
    older.checks[0]!.rules = older.checks[0]!.rules.filter((r) => r.id !== rule.id);
    const out = buildRuleTiles(adl, allowances, older);
    expect(out.tiles.reduce((sum, t) => sum + t.count, 0)).toBe(out.total);
    const row = out.tiles.flatMap((t) => t.rows).find((r) => r.key === rule.id)!;
    expect(row.passed).toBeNull();
  });

  it("holds every rule of the real committed snapshot, and its tiles add up to the real headline", () => {
    const out = buildRuleTiles(adl, allowances, real);
    expect(out.tiles.reduce((sum, t) => sum + t.count, 0)).toBe(out.total);
    expect(out.total).toBe(real.checks.flatMap((c) => c.rules).length);
    expect(out.tiles.flatMap((t) => [...t.rows, ...t.extraRows]).filter((r) => r.kind !== "prose")).toHaveLength(out.total - 1); // every rule but the budget rule, which has its own tile
  });
});
