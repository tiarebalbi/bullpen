import type { Adl, AdlLine } from "./adl.js";
import type { RulesSnapshot } from "./rulesSnapshot.js";

// The rules that already held at Part 1, by the id the parser makes from each
// rule's text. Every other rule in the snapshot arrived in Part 2. The test
// next to this file keeps these ids equal to rules the real ADL states: two
// structural asserts, and the two that keep the apps apart.
const IN_FORCE_AT_PART_1_RULE_IDS = new Set([
  "every-directory-under-apps-and-packages-is-defined",
  "every-defined-component-and-library-exists-as-a-directory",
  "landing-has-no-dependency-on-trading-app",
  "trading-app-has-no-dependency-on-landing",
]);
const IN_FORCE_AT_PART_1_CHECKS = new Set(["budget", "explorer consistency"]);

export interface RuleRow {
  id: string;
  rule: string;
  check: string;
  passed: boolean;
  /** The part this rule started failing builds in. */
  since: number;
  /** The ASSERT line as written in structure.adl, if the rule is one of its asserts. */
  line: AdlLine | null;
}

export interface CommandRow {
  name: string;
  command: string;
  passed: boolean;
  summary: string;
}

export interface RulesTabData {
  snapshot: { part: number; commit: string; generatedAt: string; passed: boolean; dirty: boolean } | null;
  rows: RuleRow[];
  commands: CommandRow[];
}

export function ruleSince(id: string, check: string): number {
  return IN_FORCE_AT_PART_1_RULE_IDS.has(id) || IN_FORCE_AT_PART_1_CHECKS.has(check) ? 1 : 2;
}

/** The ids of the rules that already held at Part 1, so a test can hold them to the real ADL. */
export const part1RuleIds = (): string[] => [...IN_FORCE_AT_PART_1_RULE_IDS];

function adlLineFor(adl: Adl, id: string): AdlLine | null {
  const rule = adl.rules.find((candidate) => candidate.id === id);
  return rule ? (adl.lines.find((line) => line.number === rule.line) ?? null) : null;
}

/** The Rules tab's rows, straight from a snapshot: every rule with its check and result, and every command that ran. */
export function buildRulesTabData(snapshot: RulesSnapshot | null, adl: Adl): RulesTabData {
  if (!snapshot) return { snapshot: null, rows: [], commands: [] };
  return {
    snapshot: { part: snapshot.part, commit: snapshot.commit, generatedAt: snapshot.generatedAt, passed: snapshot.passed, dirty: snapshot.dirty },
    rows: snapshot.checks.flatMap((check) => check.rules).map((rule) => ({ ...rule, since: ruleSince(rule.id, rule.check), line: adlLineFor(adl, rule.id) })),
    commands: snapshot.checks.map((check) => ({ name: check.name, command: check.command, passed: check.passed, summary: check.summary })),
  };
}
