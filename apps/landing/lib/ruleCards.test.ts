import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl } from "./adl.js";
import { parseAllowances } from "./cost.js";
import { buildRuleCards, ruleCardChip } from "./ruleCards.js";
import type { CheckArchResult } from "./check-arch.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adl = parseAdl(readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8"));
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));

const PASSING: CheckArchResult = {
  ranAt: "2026-09-26T12:00:00.000Z",
  command: "pnpm --filter @bullpen/fitness-checks run check:arch",
  exitCode: 0,
  passed: true,
  summary: "check:arch passed: 5 ADL entries verified",
  output: "check:arch passed: 5 ADL entries verified",
};

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
  it("gives check-arch-backed cards a real pass/fail chip", () => {
    const cards = buildRuleCards(adl, allowances);
    const structureChip = ruleCardChip(cards[0]!, PASSING);
    expect(structureChip.tone).toBe("gain");
    expect(structureChip.label).toContain("2026-09-26");
  });

  it("never claims a pass for a ci-only card, even when check:arch itself passed", () => {
    const cards = buildRuleCards(adl, allowances);
    const boundariesChip = ruleCardChip(cards[1]!, PASSING);
    expect(boundariesChip.tone).toBe("neutral");
    expect(boundariesChip.label).toBe("runs in CI");
  });

  it("marks check-arch-backed cards as failing when check:arch failed", () => {
    const failing: CheckArchResult = { ...PASSING, passed: false, exitCode: 1 };
    const cards = buildRuleCards(adl, allowances);
    const chip = ruleCardChip(cards[0]!, failing);
    expect(chip.tone).toBe("loss");
  });
});
