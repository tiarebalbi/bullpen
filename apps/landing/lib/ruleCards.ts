import type { Adl, AdlRuleToken } from "./adl.js";
import type { AllowanceEntry } from "./cost.js";
import { tokenizeAdlRule } from "./adl.js";
import { checkOutcome, ruleOutcome, type RulesSnapshot } from "./rulesSnapshot.js";

/** Where a card's pass/fail comes from in the snapshot: the rules of named check:arch checks, or a whole snapshot check by id prefix. */
export type RuleCardResult = { checks: string[] } | { snapshotCheck: string };

export interface RuleCardData {
  id: string;
  checkName: string;
  sourceFile: string;
  ruleLines: AdlRuleToken[][];
  cadence: string;
  result: RuleCardResult;
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
 * Each card's pass/fail comes from the latest committed rules snapshot
 * (architecture/reports/part-0N/summary.json), never from a hardcoded
 * pass: see `ruleCardChip`.
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
      cadence: "Structure check · every push (CI)",
      result: { checks: ["structure", "explorer consistency"] },
      footnote: "Also runs: explorer ⇄ CALM consistency check",
    },
    {
      id: "boundaries",
      checkName: "turbo boundaries",
      sourceFile: "architecture/adl/structure.adl, turbo.json",
      ruleLines: [tokenizeAdlRule(boundariesRule)],
      cadence: "Package boundaries · every push (CI)",
      result: { snapshotCheck: "turbo-boundaries" },
    },
    {
      id: "calm",
      checkName: "calm validate --strict",
      sourceFile: "architecture/calm/",
      ruleLines: [[{ text: "calm validate --strict -f junit", keyword: false }]],
      cadence: "CALM model · every push (CI)",
      result: { snapshotCheck: "calm-" },
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
      cadence: "Free-tier budget · every push (CI)",
      result: { checks: ["budget"] },
    },
  ];
}

export interface RuleChip {
  tone: "gain" | "loss" | "neutral";
  label: string;
}

/** Whether a card's rules held in `snapshot`: null when there is no snapshot or it has no result for this card. */
export function ruleCardOutcome(card: RuleCardData, snapshot: RulesSnapshot | null): boolean | null {
  if ("snapshotCheck" in card.result) return checkOutcome(snapshot, card.result.snapshotCheck);
  const outcomes = card.result.checks.map((name) => ruleOutcome(snapshot, name)).filter((outcome): outcome is boolean => outcome !== null);
  return outcomes.length === 0 ? null : outcomes.every(Boolean);
}

/**
 * The chip on a rule card: the snapshot's real result with the date and
 * commit it was for, or a neutral "no snapshot yet". Never a fabricated pass.
 */
export function ruleCardChip(card: RuleCardData, snapshot: RulesSnapshot | null): RuleChip {
  const outcome = ruleCardOutcome(card, snapshot);
  if (outcome === null || !snapshot) return { tone: "neutral", label: "no snapshot yet" };
  const stamp = `${snapshot.generatedAt.slice(0, 10)} · ${snapshot.commit.slice(0, 7)}`;
  return outcome ? { tone: "gain", label: `pass · ${stamp}` } : { tone: "loss", label: `fail · ${stamp}` };
}
