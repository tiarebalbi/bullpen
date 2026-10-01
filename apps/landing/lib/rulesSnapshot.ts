import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface SnapshotRule {
  rule: string;
  check: string;
  passed: boolean;
}

export interface SnapshotCheck {
  id: string;
  name: string;
  command: string;
  passed: boolean;
  summary: string;
  raw: string;
  rules: SnapshotRule[];
}

/** One committed run of every rule check: architecture/reports/part-0N/summary.json. */
export interface RulesSnapshot {
  schema: 1;
  part: number;
  generatedAt: string;
  commit: string;
  dirty: boolean;
  ref: string;
  source: "local" | "github-actions";
  passed: boolean;
  checks: SnapshotCheck[];
}

/**
 * Parses a summary.json. Throws on anything that is not a snapshot rather
 * than rendering a pass that was never recorded.
 */
export function parseRulesSnapshot(content: string, label: string): RulesSnapshot {
  let data: Partial<RulesSnapshot>;
  try {
    data = JSON.parse(content) as Partial<RulesSnapshot>;
  } catch (cause) {
    throw new Error(`${label}: invalid JSON (${(cause as Error).message})`, { cause });
  }
  const fail = (what: string): never => {
    throw new Error(`${label}: ${what}`);
  };
  if (data.schema !== 1) fail(`unknown schema ${JSON.stringify(data.schema)}`);
  if (typeof data.part !== "number") fail("missing part");
  for (const key of ["generatedAt", "commit", "ref"] as const) if (typeof data[key] !== "string" || data[key] === "") fail(`missing ${key}`);
  if (typeof data.passed !== "boolean") fail("missing passed");
  if (typeof data.dirty !== "boolean") fail("missing dirty");
  if (!Array.isArray(data.checks) || data.checks.length === 0) fail("missing checks");
  return data as RulesSnapshot;
}

/** The snapshot of the highest part that has one, or null if no part has been snapshotted yet. */
export function loadLatestRulesSnapshot(reportsDir: string): RulesSnapshot | null {
  if (!existsSync(reportsDir)) return null;
  const parts = readdirSync(reportsDir)
    .filter((name) => /^part-0[1-6]$/.test(name) && existsSync(join(reportsDir, name, "summary.json")))
    .sort();
  const latest = parts[parts.length - 1];
  if (!latest) return null;
  return parseRulesSnapshot(readFileSync(join(reportsDir, latest, "summary.json"), "utf8"), `architecture/reports/${latest}/summary.json`);
}

/**
 * Whether every rule a named check enforces held in the snapshot, or null if
 * the snapshot has no rule for that check (so nothing can be claimed).
 */
export function ruleOutcome(snapshot: RulesSnapshot | null, checkName: string): boolean | null {
  if (!snapshot) return null;
  const rules = snapshot.checks.flatMap((check) => check.rules).filter((rule) => rule.check === checkName);
  return rules.length === 0 ? null : rules.every((rule) => rule.passed);
}

/** Whether a whole snapshot check (by id prefix, e.g. "calm-") passed, or null if there is none. */
export function checkOutcome(snapshot: RulesSnapshot | null, idPrefix: string): boolean | null {
  if (!snapshot) return null;
  const checks = snapshot.checks.filter((check) => check.id === idPrefix || check.id.startsWith(idPrefix));
  return checks.length === 0 ? null : checks.every((check) => check.passed);
}
