import { groupLines, type Adl, type AdlGroup, type AdlToken } from "./adl.js";
import type { AllowanceEntry } from "./cost.js";
import { checkOutcome, ruleOutcome, type RulesSnapshot, type SnapshotRule } from "./rulesSnapshot.js";

const ADL_FILE = "architecture/adl/structure.adl";
const MAX_BUDGET_FRACTION = 0.9;

/**
 * Rules the checks enforce that structure.adl has no line for. Each is listed inside the tile of the family it belongs to, so the
 * tiles add up to the headline. A rule in a check that is not here makes the build fail (see `placeExtraRule`): a new check cannot
 * be enforced and shown nowhere.
 */
const EXTRA_RULE_TILE: Record<string, string> = {
  "model currency": "Model currency",
  "explorer consistency": "Model currency",
  "data ownership": "Data ownership",
  "rule coverage": "Structural assertions",
  "email in files": "Entry points and secrets",
  "web url": "Entry points and secrets",
};

export interface TileRow {
  /** An ASSERT line as written, drawn with the parser's tokens; or a rule stated in words. */
  kind: "adl" | "extra" | "prose";
  key: string;
  text: string;
  tokens?: AdlToken[];
  /** The ASSERT line's number in structure.adl. */
  line?: number;
  passed: boolean | null;
}

export interface RuleTile {
  id: string;
  title: string;
  sub?: string;
  /** "7 rules", "CLI check" or "Fitness function". */
  countLabel: string;
  /** How many of the snapshot's rules this tile holds: the tiles' counts add up to the headline. */
  count: number;
  passed: boolean | null;
  /** "turbo boundaries · every push (CI)". */
  check: string;
  sourceFile: string;
  /** "# Allowed dependencies", or "" for a tile with no heading. */
  head: string;
  rows: TileRow[];
  /** Rules enforced for this family that have no ASSERT line (the second list in the detail panel). */
  extraRows: TileRow[];
  /** "pass · 2026-10-13 · 7bf8a5d", or "no snapshot yet". */
  result: string;
}

export interface RuleTiles {
  tiles: RuleTile[];
  /** The headline: rules that held, and rules the snapshot ran. */
  passing: number;
  total: number;
  /** "2026-10-13 · 7bf8a5d", or null with no snapshot. */
  stamp: string | null;
  /** "38/38", or "" with no snapshot. */
  ratio: string;
}

const stampOf = (snapshot: RulesSnapshot | null): string | null => (snapshot ? `${snapshot.generatedAt.slice(0, 10)} · ${snapshot.commit.slice(0, 7)}` : null);

function allOf(values: Array<boolean | null>): boolean | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return values.every(Boolean);
}

function cadence(checks: string[]): string {
  return `${checks.length > 0 ? [...new Set(checks)].join(", ") : "check:arch"} · every push (CI)`;
}

function resultLine(passed: boolean | null, stamp: string | null): string {
  if (passed === null || stamp === null) return "no snapshot yet";
  return `${passed ? "pass" : "fail"} · ${stamp}`;
}

function placeExtraRule(rule: SnapshotRule): string {
  const heading = EXTRA_RULE_TILE[rule.check];
  if (!heading) {
    throw new Error(`The snapshot has a rule from the check "${rule.check}" that structure.adl has no line for and that no tile holds: "${rule.rule}". Add the check to EXTRA_RULE_TILE in apps/landing/lib/ruleTiles.ts.`);
  }
  return heading;
}

function adlTile(adl: Adl, group: AdlGroup, snapshot: RulesSnapshot | null, extras: SnapshotRule[]): RuleTile {
  const stamp = stampOf(snapshot);
  const snapshotRules = new Map((snapshot?.checks.flatMap((c) => c.rules) ?? []).map((r) => [r.id, r]));
  const lines = groupLines(adl, group);
  const ruleByLine = new Map(group.ruleIds.map((id) => [adl.rules.find((r) => r.id === id)!.line, id]));
  const rows: TileRow[] = lines
    .filter((line) => ruleByLine.has(line.number))
    .map((line) => ({ kind: "adl", key: ruleByLine.get(line.number)!, text: line.raw.trim(), tokens: line.tokens, line: line.number, passed: snapshotRules.get(ruleByLine.get(line.number)!)?.passed ?? null }));
  const extraRows: TileRow[] = extras.map((rule) => ({ kind: "extra", key: rule.id, text: rule.rule, passed: rule.passed }));
  const checks = [...group.ruleIds.map((id) => snapshotRules.get(id)?.check), ...extras.map((r) => r.check)].filter((c): c is string => Boolean(c));
  const passed = allOf([...rows, ...extraRows].map((r) => r.passed));
  const shown = rows.length + extraRows.length;
  // Only a rule the snapshot ran counts toward the headline; an ASSERT it has no result for is shown as "no result".
  const count = rows.filter((r) => r.passed !== null).length + extraRows.length;
  const sub = /\((.+)\)$/.exec(group.heading)?.[1];
  return {
    id: `adl-${group.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
    title: group.heading.replace(/\s*\(.+\)$/, ""),
    sub,
    countLabel: `${shown} ${shown === 1 ? "rule" : "rules"}`,
    count,
    passed,
    check: cadence(checks),
    sourceFile: ADL_FILE,
    head: `# ${group.heading}`,
    rows,
    extraRows,
    result: resultLine(passed, stamp),
  };
}

function calmTile(snapshot: RulesSnapshot | null): RuleTile {
  const passed = checkOutcome(snapshot, "calm-");
  return {
    id: "calm",
    title: "CALM model",
    countLabel: "CLI check",
    count: 0,
    passed,
    check: "calm validate --strict · every push (CI)",
    sourceFile: "architecture/calm/",
    head: "",
    rows: [{ kind: "prose", key: "calm", text: "calm validate --strict -f junit", passed }],
    extraRows: [],
    result: resultLine(passed, stampOf(snapshot)),
  };
}

function budgetTile(allowances: AllowanceEntry[], snapshot: RulesSnapshot | null): RuleTile {
  const coingecko = allowances.find((a) => a.service === "coingecko-demo" && a.metric === "monthly_calls");
  if (!coingecko) throw new Error('cost/allowances.json has no "coingecko-demo"/"monthly_calls" entry to build the budget tile');
  const max = Math.round(coingecko.allowance * MAX_BUDGET_FRACTION);
  const passed = ruleOutcome(snapshot, "budget");
  return {
    id: "budget",
    title: "Free-tier budget",
    countLabel: "Fitness function",
    count: snapshot ? snapshot.checks.flatMap((c) => c.rules).filter((r) => r.check === "budget").length : 0,
    passed,
    check: "budget-check.ts · every push (CI)",
    sourceFile: "architecture/fitness/src/budget-check.ts",
    head: "",
    rows: [
      {
        kind: "prose",
        key: "budget",
        text: `Modeled monthly CoinGecko calls stay ≤ ${MAX_BUDGET_FRACTION * 100}% of the Demo plan's ${coingecko.allowance.toLocaleString("en-US")} calls/month allowance (max ${max.toLocaleString("en-US")}).`,
        passed,
      },
    ],
    extraRows: [],
    result: resultLine(passed, stampOf(snapshot)),
  };
}

/**
 * The eight Rules tiles and the headline that adds up from them. A tile is a `#` heading of structure.adl with its ASSERT lines, and the
 * rules the checks enforce without an ASSERT line, listed in the tile of their family; then the CALM model (a command, not a snapshot rule)
 * and the budget rule. Every rule of the snapshot lands in exactly one tile, and the headline is the sum of the tiles' counts: that is
 * checked here, not trusted, so the headline cannot say 38 while the tiles show 32.
 */
export function buildRuleTiles(adl: Adl, allowances: AllowanceEntry[], snapshot: RulesSnapshot | null): RuleTiles {
  const snapshotRules = snapshot?.checks.flatMap((check) => check.rules) ?? [];
  const adlIds = new Set(adl.rules.map((rule) => rule.id));
  const extras = snapshotRules.filter((rule) => !adlIds.has(rule.id) && rule.check !== "budget");
  const extrasByHeading = new Map<string, SnapshotRule[]>();
  for (const rule of extras) {
    const heading = placeExtraRule(rule);
    extrasByHeading.set(heading, [...(extrasByHeading.get(heading) ?? []), rule]);
  }
  for (const heading of extrasByHeading.keys()) {
    if (!adl.groups.some((group) => group.heading === heading)) throw new Error(`structure.adl has no heading "${heading}" to hold the rules of its family.`);
  }
  const tiles = [...adl.groups.map((group) => adlTile(adl, group, snapshot, extrasByHeading.get(group.heading) ?? [])), calmTile(snapshot), budgetTile(allowances, snapshot)];

  const total = snapshotRules.length;
  const counted = tiles.reduce((sum, tile) => sum + tile.count, 0);
  if (snapshot && counted !== total) {
    throw new Error(`The tiles hold ${counted} rules but the snapshot ran ${total}: a rule of the snapshot is in no tile, or in two.`);
  }
  const passing = snapshotRules.filter((rule) => rule.passed).length;
  return { tiles, passing, total, stamp: stampOf(snapshot), ratio: snapshot ? `${passing}/${total}` : "" };
}

