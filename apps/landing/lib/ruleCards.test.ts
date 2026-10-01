import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdl } from "./adl.js";
import { parseAllowances } from "./cost.js";
import { buildRuleCards, type RuleCardView } from "./ruleCards.js";
import { cardChip, ruleChip } from "./ruleChips.js";
import type { RulesSnapshot, SnapshotRule } from "./rulesSnapshot.js";

const landingRoot = join(import.meta.dirname, "..");
const repoRoot = join(landingRoot, "..", "..");
const adl = loadAdl(join(landingRoot, ".generated", "adl.json"));
const adlFile = readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8").split("\n");
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));

/** A snapshot with a result for every ASSERT of the real ADL, under the check that enforces it. */
function snapshotWith(failing: string[] = [], overrides: { boundaries?: boolean; calm?: boolean } = {}): RulesSnapshot {
  const { boundaries = true, calm = true } = overrides;
  const rules: SnapshotRule[] = adl.rules.map((rule) => ({ id: rule.id, rule: rule.text, check: "check", passed: !failing.includes(rule.id) }));
  return {
    schema: 2,
    part: 2,
    generatedAt: "2026-09-26T12:00:00.000Z",
    commit: "0123456789abcdef0123456789abcdef01234567",
    dirty: false,
    ref: "test",
    source: "local",
    passed: true,
    checks: [
      { id: "check-arch", name: "check:arch", command: "pnpm check:arch", passed: true, summary: "", raw: "check-arch.txt", rules: [...rules, { id: "budget-rule", rule: "budget rule", check: "budget", passed: true }] },
      { id: "turbo-boundaries", name: "turbo boundaries", command: "x", passed: boundaries, summary: "", raw: "b.txt", rules: [] },
      { id: "calm-part-01", name: "calm validate (part-01)", command: "x", passed: true, summary: "", raw: "c1.json", rules: [] },
      { id: "calm-timeline", name: "calm validate (timeline)", command: "x", passed: calm, summary: "", raw: "c2.json", rules: [] },
    ],
  };
}

const ids = (views: RuleCardView[]) => views.map((view) => view.card.id);
const adlCards = (views: RuleCardView[]) => views.filter((view) => view.card.kind === "adl");
const byId = (views: RuleCardView[], id: string) => views.find((view) => view.card.id === id)!;

describe("buildRuleCards", () => {
  const views = buildRuleCards(adl, allowances, snapshotWith());

  it("makes one card per # heading of structure.adl, then the CALM card and the budget card", () => {
    expect(ids(views)).toEqual([
      "adl-structural-assertions",
      "adl-allowed-dependencies",
      "adl-disallowed-dependencies-direct-and-transitive",
      "adl-entry-points-and-secrets",
      "adl-model-currency",
      "calm",
      "budget",
    ]);
    expect(adlCards(views).map((view) => (view.card.kind === "adl" ? view.card.heading : ""))).toEqual(adl.groups.map((group) => group.heading));
  });

  it("shows each card's heading and ASSERT lines exactly as the file has them, indentation included, in file order", () => {
    for (const view of adlCards(views)) {
      if (view.card.kind !== "adl") continue;
      expect(view.card.sourceFile).toBe("architecture/adl/structure.adl");
      for (const line of view.card.lines) {
        expect(line.raw, `line ${line.number}`).toBe(adlFile[line.number - 1]);
        expect(line.tokens.map((token) => token.text).join("")).toBe(line.raw);
      }
      expect(view.card.lines[0]!.raw.startsWith("# ")).toBe(true);
      expect(view.card.lines.slice(1).every((line) => line.raw.startsWith("ASSERT(") && line.ruleId !== null)).toBe(true);
    }
  });

  it("has every ASSERT of the file on exactly one card", () => {
    const shown = adlCards(views).flatMap((view) => (view.card.kind === "adl" ? view.card.lines.flatMap((line) => (line.ruleId ? [line.ruleId] : [])) : []));
    expect(shown.sort()).toEqual(adl.rules.map((rule) => rule.id).sort());
  });

  it("looks each rule's result up by its id, never by position", () => {
    const failing = adl.rules.find((rule) => rule.text === "Landing HAS NO DEPENDENCY ON Trading App")!;
    const withFailure = buildRuleCards(adl, allowances, snapshotWith([failing.id]));
    const disallowed = byId(withFailure, "adl-disallowed-dependencies-direct-and-transitive");

    expect(disallowed.results[failing.id]!.passed).toBe(false);
    const others = Object.entries(disallowed.results).filter(([id]) => id !== failing.id);
    expect(others.every(([, result]) => result.passed === true)).toBe(true);
    const allowed = adl.rules.find((rule) => rule.text === "Landing IS DEPENDENT ON UI, Contracts")!;
    expect(byId(withFailure, "adl-allowed-dependencies").results[allowed.id]!.passed).toBe(true);
  });

  it("names, in the foot, what enforces the group's rules, from the snapshot, and says check:arch with no snapshot", () => {
    expect(byId(views, "adl-model-currency").card.cadence).toBe("check · every push (CI)");
    expect(byId(buildRuleCards(adl, allowances, null), "adl-model-currency").card.cadence).toBe("check:arch · every push (CI)");
  });

  it("computes the budget card's figure from the real coingecko-demo allowance, not a hardcoded number", () => {
    const budget = byId(views, "budget").card;
    const text = budget.kind === "check" ? budget.lines.flat().map((token) => token.text).join("") : "";
    const real = allowances.find((a) => a.service === "coingecko-demo" && a.metric === "monthly_calls")!;
    expect(text).toContain(real.allowance.toLocaleString("en-US"));
  });

  it("keeps the CALM card's own source: it is not an ADL rule", () => {
    const calm = byId(views, "calm").card;
    expect(calm.kind).toBe("check");
    expect(calm.sourceFile).toBe("architecture/calm/");
  });

  it("throws if the coingecko-demo allowance is missing", () => {
    expect(() => buildRuleCards(adl, [], null)).toThrow(/no "coingecko-demo"\/"monthly_calls" entry/);
  });
});

describe("the chips", () => {
  const views = buildRuleCards(adl, allowances, snapshotWith());
  const dependencies = byId(views, "adl-allowed-dependencies");
  const firstId = adl.rules.find((rule) => rule.text === "every directory under apps and packages is DEFINED")!.id;

  it("shows the snapshot's real pass on a card, with the date and commit it was for", () => {
    expect(cardChip(dependencies)).toEqual({ tone: "gain", label: "pass · 2026-09-26 · 0123456" });
  });

  it("shows each ASSERT's own result", () => {
    expect(ruleChip(byId(views, "adl-structural-assertions").results[firstId])).toEqual({ tone: "gain", label: "✓ pass" });
    expect(ruleChip({ passed: false, since: 1 })).toEqual({ tone: "loss", label: "✕ fail" });
    expect(ruleChip({ passed: null, since: 1 })).toEqual({ tone: "neutral", label: "no result" });
    expect(ruleChip(undefined)).toEqual({ tone: "neutral", label: "no result" });
  });

  it("fails a card when any rule under it failed, and only that card", () => {
    const failing = adl.rules.find((rule) => rule.text === "Contracts HAS NO DEPENDENCY ON Landing, Trading App")!;
    const withFailure = buildRuleCards(adl, allowances, snapshotWith([failing.id]));
    expect(cardChip(byId(withFailure, "adl-disallowed-dependencies-direct-and-transitive")).tone).toBe("loss");
    expect(cardChip(byId(withFailure, "adl-allowed-dependencies")).tone).toBe("gain");
  });

  it("marks only the CALM card when the CALM check failed, and leaves the budget card alone", () => {
    const withFailure = buildRuleCards(adl, allowances, snapshotWith([], { calm: false }));
    expect(cardChip(byId(withFailure, "calm")).tone).toBe("loss");
    expect(cardChip(byId(withFailure, "budget")).tone).toBe("gain");
    expect(cardChip(byId(withFailure, "adl-model-currency")).tone).toBe("gain");
  });

  it("says a rule arrives in a later part instead of passing it, per ASSERT and per card", () => {
    const secret = adl.rules.find((rule) => rule.text.startsWith("ONLY "))!;
    const entry = byId(views, "adl-entry-points-and-secrets");
    expect(ruleChip(entry.results[secret.id], 1)).toEqual({ tone: "outline", label: "Arrives in Part 2" });
    expect(ruleChip(entry.results[secret.id], 2)).toEqual({ tone: "gain", label: "✓ pass" });
    expect(cardChip(entry, 1)).toEqual({ tone: "outline", label: "Arrives in Part 2" });
    expect(cardChip(entry, 2).tone).toBe("gain");
  });

  it("counts, at Part 1, only the rules that already held: the apps-apart rules pass, the allow-list arrives", () => {
    const disallowed = byId(views, "adl-disallowed-dependencies-direct-and-transitive");
    const apps = adl.rules.filter((rule) => rule.text === "Landing HAS NO DEPENDENCY ON Trading App" || rule.text === "Trading App HAS NO DEPENDENCY ON Landing");
    const libraries = adl.rules.filter((rule) => rule.text.startsWith("UI HAS NO") || rule.text.startsWith("Contracts HAS NO"));
    for (const rule of apps) expect(ruleChip(disallowed.results[rule.id], 1).tone).toBe("gain");
    for (const rule of libraries) expect(ruleChip(disallowed.results[rule.id], 1).label).toBe("Arrives in Part 2");
    expect(cardChip(disallowed, 1).tone).toBe("gain");
    expect(cardChip(byId(views, "adl-allowed-dependencies"), 1).label).toBe("Arrives in Part 2");
  });

  it("claims nothing without a snapshot, or for a card the snapshot has no result for", () => {
    for (const view of buildRuleCards(adl, allowances, null)) expect(cardChip(view)).toEqual({ tone: "neutral", label: "no snapshot yet" });
    const empty: RulesSnapshot = { ...snapshotWith(), checks: [{ id: "check-arch", name: "check:arch", command: "x", passed: true, summary: "", raw: "x", rules: [] }] };
    const noResults = buildRuleCards(adl, allowances, empty);
    expect(cardChip(byId(noResults, "calm")).tone).toBe("neutral");
    expect(cardChip(byId(noResults, "budget")).tone).toBe("neutral");
    expect(cardChip(byId(noResults, "adl-allowed-dependencies")).tone).toBe("neutral");
  });
});
