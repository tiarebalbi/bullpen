import type { Adl, AdlRuleToken } from "./adl.js";
import type { AllowanceEntry } from "./cost.js";
import type { CheckArchResult } from "./check-arch.js";
import { tokenizeAdlRule } from "./adl.js";

export type RuleResultSource = "check-arch" | "ci-only";

export interface RuleCardData {
  id: string;
  checkName: string;
  sourceFile: string;
  ruleLines: AdlRuleToken[][];
  cadence: string;
  resultSource: RuleResultSource;
  footnote?: string;
}

const MAX_BUDGET_FRACTION = 0.9;

/**
 * Builds the Rules card's four real mini-cards from this repo's own data,
 * never hand-typed pseudocode: the two structural ASSERTs and the
 * boundaries ASSERT come straight from architecture/adl/structure.adl
 * (via adl.rules, tokenized for keyword highlighting), and the budget
 * card's figure comes from the real coingecko-demo/monthly_calls
 * allowance rather than a hardcoded number.
 *
 * Only "check:arch" (structure + budget + explorer-consistency, see
 * architecture/fitness/src/cli.ts) has a real pass/fail result captured
 * at build time today (checkArch). "turbo boundaries" and "calm validate"
 * only run in CI and have no build-time-captured result yet -- until
 * Phase B's CI snapshot exists, those two cards get a resultSource of
 * "ci-only" and render a neutral "runs in CI" chip, never a fabricated
 * pass.
 */
export function buildRuleCards(adl: Adl, allowances: AllowanceEntry[]): RuleCardData[] {
  const [structureRule1, structureRule2, boundariesRule] = adl.rules;
  if (!structureRule1 || !structureRule2 || !boundariesRule) {
    throw new Error("structure.adl must have at least 3 ASSERT rules to build the Rules card");
  }

  const coingeckoAllowance = allowances.find((a) => a.service === "coingecko-demo" && a.metric === "monthly_calls");
  if (!coingeckoAllowance) {
    throw new Error('cost/allowances.json has no "coingecko-demo"/"monthly_calls" entry to build the budget rule card');
  }
  const maxAllowedCalls = Math.round(coingeckoAllowance.allowance * MAX_BUDGET_FRACTION);

  return [
    {
      id: "structure",
      checkName: "check:arch",
      sourceFile: "architecture/adl/structure.adl",
      ruleLines: [tokenizeAdlRule(structureRule1), tokenizeAdlRule(structureRule2)],
      cadence: "Structure check · every push (CI) and every landing build",
      resultSource: "check-arch",
      footnote: "Also runs: explorer ⇄ CALM consistency check",
    },
    {
      id: "boundaries",
      checkName: "turbo boundaries",
      sourceFile: "architecture/adl/structure.adl, turbo.json",
      ruleLines: [tokenizeAdlRule(boundariesRule)],
      cadence: "Package boundaries · every push (CI)",
      resultSource: "ci-only",
    },
    {
      id: "calm",
      checkName: "calm validate --strict",
      sourceFile: "architecture/calm/moments/part-01.architecture.json",
      ruleLines: [[{ text: "calm validate --strict -f junit", keyword: false }]],
      cadence: "CALM model · every push (CI)",
      resultSource: "ci-only",
    },
    {
      id: "budget",
      checkName: "CoinGecko budget",
      sourceFile: "architecture/fitness/src/budget-check.ts",
      ruleLines: [
        [
          { text: "Modeled monthly CoinGecko calls stay ", keyword: false },
          { text: `≤ ${MAX_BUDGET_FRACTION * 100}%`, keyword: true },
          { text: ` of the Demo plan's ${coingeckoAllowance.allowance.toLocaleString("en-US")} calls/month allowance (max ${maxAllowedCalls.toLocaleString("en-US")}).`, keyword: false },
        ],
      ],
      cadence: "Free-tier budget · every push (CI) and every landing build",
      resultSource: "check-arch",
    },
  ];
}

export function ruleCardChip(card: RuleCardData, checkArch: CheckArchResult): { tone: "gain" | "loss" | "neutral"; label: string } {
  if (card.resultSource === "ci-only") {
    return { tone: "neutral", label: "runs in CI" };
  }
  const date = checkArch.ranAt.slice(0, 10);
  return checkArch.passed ? { tone: "gain", label: `pass · ${date}` } : { tone: "loss", label: `fail · see CI` };
}
