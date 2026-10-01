import type { AdlToken } from "./adl.js";

/**
 * What a Rules card needs to say, as plain data with no file access, so the
 * home page (a Server Component) and the Rules tab (a Client Component) draw
 * the same cards from the same snapshot.
 */

export interface AdlCardLine {
  number: number;
  raw: string;
  tokens: AdlToken[];
  /** The id of the rule this ASSERT line states, or null for the `#` heading above it. */
  ruleId: string | null;
}

/** A card for one `#` heading of structure.adl: the heading and its ASSERT lines, as written. */
export interface AdlRuleCard {
  kind: "adl";
  id: string;
  heading: string;
  sourceFile: string;
  cadence: string;
  lines: AdlCardLine[];
}

/** A card for a check whose source is not ADL (calm validate, the budget check): it shows its own source. */
export interface CheckRuleCard {
  kind: "check";
  id: string;
  checkName: string;
  sourceFile: string;
  cadence: string;
  lines: AdlToken[][];
  footnote?: string;
}

export type RuleCardData = AdlRuleCard | CheckRuleCard;

/** One rule's result in the snapshot, and the part it started failing builds in. */
export interface RuleResult {
  passed: boolean | null;
  since: number;
}

export interface RuleCardView {
  card: RuleCardData;
  /** The date and commit of the snapshot the results come from, or null with none. */
  stamp: string | null;
  /** By rule id for an ADL card; by the card's own id for a check card. */
  results: Record<string, RuleResult>;
}

export interface RuleChip {
  tone: "gain" | "loss" | "neutral" | "outline";
  label: string;
}

/** The ids a card is judged by. */
export function cardKeys(card: RuleCardData): string[] {
  return card.kind === "adl" ? card.lines.flatMap((line) => (line.ruleId ? [line.ruleId] : [])) : [card.id];
}

/** One ASSERT's chip: its result, or "Arrives in Part N" if the selected part is before the part it started to count in. */
export function ruleChip(result: RuleResult | undefined, part?: number): RuleChip {
  if (result && part !== undefined && result.since > part) return { tone: "outline", label: `Arrives in Part ${result.since}` };
  if (!result || result.passed === null) return { tone: "neutral", label: "no result" };
  return result.passed ? { tone: "gain", label: "✓ pass" } : { tone: "loss", label: "✕ fail" };
}

/**
 * The chip at the foot of a card: the snapshot's real result for the rules in
 * force, with the date and commit it was for. Never a pass nobody recorded:
 * with no result it says so, and with every rule still to come it says when.
 */
export function cardChip(view: RuleCardView, part?: number): RuleChip {
  const results = cardKeys(view.card).map((key) => view.results[key]);
  const inForce = results.filter((result) => result && (part === undefined || result.since <= part));
  if (inForce.length === 0 && results.some((result) => result && part !== undefined && result.since > part)) {
    return { tone: "outline", label: `Arrives in Part ${Math.min(...results.map((result) => result!.since))}` };
  }
  const known = inForce.filter((result): result is RuleResult => result !== undefined && result.passed !== null);
  if (known.length === 0 || view.stamp === null) return { tone: "neutral", label: "no snapshot yet" };
  return known.every((result) => result.passed) ? { tone: "gain", label: `pass · ${view.stamp}` } : { tone: "loss", label: `fail · ${view.stamp}` };
}
