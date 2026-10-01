import { groupLines, type Adl, type AdlGroup, type AdlToken } from "./adl.js";
import type { AllowanceEntry } from "./cost.js";
import type { AdlRuleCard, CheckRuleCard, RuleCardView, RuleResult } from "./ruleChips.js";
import { checkOutcome, resultForRule, ruleOutcome, type RulesSnapshot } from "./rulesSnapshot.js";
import { ruleSince } from "./rulesView.js";

export type { AdlRuleCard, CheckRuleCard, RuleCardData, RuleCardView, RuleChip, RuleResult } from "./ruleChips.js";

const MAX_BUDGET_FRACTION = 0.9;
const SOURCE_FILE = "architecture/adl/structure.adl";

const text = (value: string, keyword = false): AdlToken => ({ text: value, kind: keyword ? "keyword" : "text" });

const slugOf = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function stampOf(snapshot: RulesSnapshot | null): string | null {
  return snapshot ? `${snapshot.generatedAt.slice(0, 10)} · ${snapshot.commit.slice(0, 7)}` : null;
}

/** What enforces a group's rules, from the snapshot's own rows, so the card does not claim a check that did not run. */
function cadenceOf(group: AdlGroup, snapshot: RulesSnapshot | null): string {
  const checks = new Set(group.ruleIds.map((id) => resultForRule(snapshot, id)?.check).filter((check): check is string => Boolean(check)));
  return `${checks.size > 0 ? [...checks].join(", ") : "check:arch"} · every push (CI)`;
}

function adlCard(adl: Adl, group: AdlGroup, snapshot: RulesSnapshot | null): { card: AdlRuleCard; results: Record<string, RuleResult> } {
  const ruleIdByLine = new Map(group.ruleIds.map((id) => [adl.rules.find((rule) => rule.id === id)!.line, id]));
  const card: AdlRuleCard = {
    kind: "adl",
    id: `adl-${slugOf(group.heading)}`,
    heading: group.heading,
    sourceFile: SOURCE_FILE,
    cadence: cadenceOf(group, snapshot),
    lines: groupLines(adl, group).map((line) => ({ number: line.number, raw: line.raw, tokens: line.tokens, ruleId: ruleIdByLine.get(line.number) ?? null })),
  };
  const results = Object.fromEntries(
    group.ruleIds.map((id): [string, RuleResult] => {
      const found = resultForRule(snapshot, id);
      return [id, { passed: found?.passed ?? null, since: ruleSince(id, found?.check ?? "") }];
    }),
  );
  return { card, results };
}

function budgetCard(allowances: AllowanceEntry[]): CheckRuleCard {
  const coingecko = allowances.find((a) => a.service === "coingecko-demo" && a.metric === "monthly_calls");
  if (!coingecko) throw new Error('cost/allowances.json has no "coingecko-demo"/"monthly_calls" entry to build the budget rule card');
  const maxAllowedCalls = Math.round(coingecko.allowance * MAX_BUDGET_FRACTION);
  return {
    kind: "check",
    id: "budget",
    checkName: "CoinGecko budget",
    sourceFile: "architecture/fitness/src/budget-check.ts",
    cadence: "Free-tier budget · every push (CI)",
    lines: [
      [
        text("Modeled monthly CoinGecko calls stay "),
        text(`≤ ${MAX_BUDGET_FRACTION * 100}%`, true),
        text(` of the Demo plan's ${coingecko.allowance.toLocaleString("en-US")} calls/month allowance (max ${maxAllowedCalls.toLocaleString("en-US")}).`),
      ],
    ],
  };
}

const CALM_CARD: CheckRuleCard = {
  kind: "check",
  id: "calm",
  checkName: "calm validate --strict",
  sourceFile: "architecture/calm/",
  cadence: "CALM model · every push (CI)",
  lines: [[text("calm validate --strict -f junit")]],
};

/**
 * The Rules cards, built from this repo's own records and never hand-typed:
 * one card per `#` heading of structure.adl, each showing the heading and its
 * ASSERT lines as written, then the two checks whose source is not ADL (the
 * CALM model and the CoinGecko budget). Each rule's result comes from the
 * latest committed snapshot (architecture/reports/part-0N/summary.json), by
 * the rule's id, never from a hardcoded pass.
 */
export function buildRuleCards(adl: Adl, allowances: AllowanceEntry[], snapshot: RulesSnapshot | null): RuleCardView[] {
  const stamp = stampOf(snapshot);
  const adlViews = adl.groups.map((group) => {
    const { card, results } = adlCard(adl, group, snapshot);
    return { card, stamp, results };
  });
  const calm: RuleCardView = { card: CALM_CARD, stamp, results: { calm: { passed: checkOutcome(snapshot, "calm-"), since: 1 } } };
  const budget: RuleCardView = { card: budgetCard(allowances), stamp, results: { budget: { passed: ruleOutcome(snapshot, "budget"), since: 1 } } };
  return [...adlViews, calm, budget];
}
