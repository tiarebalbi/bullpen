import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl } from "./adl.js";
import { parseAllowances } from "./cost.js";
import { buildRuleCards, ruleCardChip } from "./ruleCards.js";
import type { RulesSnapshot } from "./rulesSnapshot.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adl = parseAdl(readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8"));
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));

function snapshotWith(outcomes: { archPassed?: boolean; boundaries?: boolean; calm?: boolean }): RulesSnapshot {
  const { archPassed = true, boundaries = true, calm = true } = outcomes;
  return {
    schema: 1,
    part: 2,
    generatedAt: "2026-09-26T12:00:00.000Z",
    commit: "0123456789abcdef0123456789abcdef01234567",
    dirty: false,
    ref: "test",
    source: "local",
    passed: archPassed && boundaries && calm,
    checks: [
      {
        id: "check-arch",
        name: "check:arch",
        command: "pnpm check:arch",
        passed: archPassed,
        summary: "",
        raw: "check-arch.txt",
        rules: [
          { rule: "r1", check: "structure", passed: archPassed },
          { rule: "r2", check: "explorer consistency", passed: true },
          { rule: "r3", check: "budget", passed: true },
        ],
      },
      { id: "turbo-boundaries", name: "turbo boundaries", command: "x", passed: boundaries, summary: "", raw: "b.txt", rules: [] },
      { id: "calm-part-01", name: "calm validate (part-01)", command: "x", passed: true, summary: "", raw: "c1.json", rules: [] },
      { id: "calm-timeline", name: "calm validate (timeline)", command: "x", passed: calm, summary: "", raw: "c2.json", rules: [] },
    ],
  };
}

describe("buildRuleCards", () => {
  it("builds exactly four cards from real repo data", () => {
    const cards = buildRuleCards(adl, allowances);
    expect(cards.map((c) => c.id)).toEqual(["structure", "boundaries", "calm", "budget"]);
  });

  it("uses the real ASSERT text, not invented pseudocode", () => {
    const cards = buildRuleCards(adl, allowances);
    const structureText = cards[0]!.ruleLines.flat().map((t) => t.text).join("");
    expect(structureText).toContain("DEFINED");
    const boundariesText = cards[1]!.ruleLines.flat().map((t) => t.text).join("");
    expect(boundariesText).toContain("NEVER DEPEND ON");
  });

  it("computes the budget card's figure from the real coingecko-demo allowance, not a hardcoded number", () => {
    const cards = buildRuleCards(adl, allowances);
    const budgetText = cards[3]!.ruleLines.flat().map((t) => t.text).join("");
    const realAllowance = allowances.find((a) => a.service === "coingecko-demo" && a.metric === "monthly_calls")!;
    expect(budgetText).toContain(realAllowance.allowance.toLocaleString("en-US"));
  });

  it("throws if the coingecko-demo allowance is missing", () => {
    expect(() => buildRuleCards(adl, [])).toThrow(/no "coingecko-demo"\/"monthly_calls" entry/);
  });
});

describe("ruleCardChip", () => {
  const cards = buildRuleCards(adl, allowances);
  const [structure, boundaries, calm, budget] = cards as [(typeof cards)[number], (typeof cards)[number], (typeof cards)[number], (typeof cards)[number]];

  it("shows the snapshot's real pass, with the date and commit it was for", () => {
    const chip = ruleCardChip(structure, snapshotWith({}));
    expect(chip.tone).toBe("gain");
    expect(chip.label).toBe("pass · 2026-09-26 · 0123456");
  });

  it("gives every card a real result, including the two that only ran in CI before", () => {
    const snapshot = snapshotWith({});
    for (const card of cards) expect(ruleCardChip(card, snapshot).tone, card.id).toBe("gain");
  });

  it("marks only the card whose check failed", () => {
    expect(ruleCardChip(boundaries, snapshotWith({ boundaries: false })).tone).toBe("loss");
    expect(ruleCardChip(calm, snapshotWith({ calm: false })).tone).toBe("loss");
    expect(ruleCardChip(structure, snapshotWith({ archPassed: false })).tone).toBe("loss");
    expect(ruleCardChip(budget, snapshotWith({ boundaries: false })).tone).toBe("gain");
    expect(ruleCardChip(structure, snapshotWith({ boundaries: false })).tone).toBe("gain");
  });

  it("claims nothing without a snapshot", () => {
    for (const card of cards) expect(ruleCardChip(card, null)).toEqual({ tone: "neutral", label: "no snapshot yet" });
  });

  it("claims nothing for a card the snapshot has no result for", () => {
    const empty: RulesSnapshot = { ...snapshotWith({}), checks: [{ id: "check-arch", name: "check:arch", command: "x", passed: true, summary: "", raw: "x", rules: [] }] };
    expect(ruleCardChip(boundaries, empty).tone).toBe("neutral");
    expect(ruleCardChip(budget, empty).tone).toBe("neutral");
  });
});
