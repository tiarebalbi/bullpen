import type { RulesSnapshot } from "./rulesSnapshot.js";

// The rules that already held at Part 1, by the text the ADL (or the check)
// words them with. Every other rule in the snapshot arrived in Part 2. The
// test next to this file keeps these strings equal to the real ADL.
const IN_FORCE_AT_PART_1_RULES = new Set([
  "every directory under apps/ and packages/ is DEFINED here",
  "every DEFINED component and library exists as a directory",
  "apps NEVER DEPEND ON other apps",
]);
const IN_FORCE_AT_PART_1_CHECKS = new Set(["budget", "explorer consistency"]);

export interface RuleRow {
  rule: string;
  check: string;
  passed: boolean;
  /** The part this rule started failing builds in. */
  since: number;
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

export function ruleSince(rule: string, check: string): number {
  return IN_FORCE_AT_PART_1_RULES.has(rule) || IN_FORCE_AT_PART_1_CHECKS.has(check) ? 1 : 2;
}

/** The Rules tab's rows, straight from a snapshot: every rule with its check and result, and every command that ran. */
export function buildRulesTabData(snapshot: RulesSnapshot | null): RulesTabData {
  if (!snapshot) return { snapshot: null, rows: [], commands: [] };
  return {
    snapshot: { part: snapshot.part, commit: snapshot.commit, generatedAt: snapshot.generatedAt, passed: snapshot.passed, dirty: snapshot.dirty },
    rows: snapshot.checks.flatMap((check) => check.rules).map((rule) => ({ ...rule, since: ruleSince(rule.rule, rule.check) })),
    commands: snapshot.checks.map((check) => ({ name: check.name, command: check.command, passed: check.passed, summary: check.summary })),
  };
}
