import { isAbsolute, relative, sep } from "node:path";

/**
 * One failed rule, in the one format every check in architecture/fitness
 * reports (ADR-0009): the rule as written, where it broke, why the rule
 * exists and the smallest change that satisfies it. An agent reading a
 * failure should be able to fix it from these four lines alone.
 */
export interface Violation {
  /** The check's short name, e.g. "structure" or "turbo boundaries". */
  check: string;
  /** The rule text, exactly as written in structure.adl (or in the ADR that records a non-structural rule). */
  rule: string;
  /** A file or directory relative to the repo root, optionally with `:line`. Never absolute. */
  where: string;
  /** One sentence, ending with the ADL line or ADR it comes from, e.g. "(ADR-0003)". */
  why: string;
  /** The smallest change that satisfies the rule. */
  fix: string;
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** True for POSIX absolute paths, Windows drive paths and UNC paths. */
export function isAbsolutePath(path: string): boolean {
  return isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** `absolutePath` as a forward-slash path relative to `repoRoot`. */
export function toRepoPath(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath).split(sep).join("/");
}

/**
 * Renders one violation:
 *
 *   ✗ <check>: <rule>
 *     where:   <path>
 *     why:     <sentence> (<source>)
 *     fix:     <change>
 *
 * Throws if `where` is an absolute path: a failure that only makes sense
 * on one machine is not a failure anyone else can act on.
 */
export function formatViolation(violation: Violation): string {
  const where = oneLine(violation.where);
  if (isAbsolutePath(where)) {
    throw new Error(`violation.where must be relative to the repo root, got ${JSON.stringify(where)}`);
  }
  return [
    `✗ ${oneLine(violation.check)}: ${oneLine(violation.rule)}`,
    `  where:   ${where}`,
    `  why:     ${oneLine(violation.why)}`,
    `  fix:     ${oneLine(violation.fix)}`,
  ].join("\n");
}

/** Renders every violation, separated by a blank line. */
export function formatViolations(violations: Violation[]): string {
  return violations.map(formatViolation).join("\n\n");
}
