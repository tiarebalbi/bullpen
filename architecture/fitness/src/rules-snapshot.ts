import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { BoundariesRun } from "./boundaries-check.js";
import { defaultBoundariesRunner } from "./boundaries-check.js";
import { ruleId } from "./adl.js";
import { runChecks, type CheckResult } from "./run-checks.js";
import { formatViolations } from "./violation.js";

export const CALM_CLI = "@finos/calm-cli@1.60.1";

export interface SnapshotRule {
  /** Derived from the rule's text (never its position), so it survives reordering the ADL. */
  id: string;
  /** The rule as worded in the ADL, or in the ADR that records it. */
  rule: string;
  /** The check that enforces it. */
  check: string;
  passed: boolean;
}

export interface SnapshotCheck {
  id: string;
  name: string;
  command: string;
  passed: boolean;
  summary: string;
  /** The raw output, as a file next to summary.json. */
  raw: string;
  rules: SnapshotRule[];
}

/**
 * One run of every rule check, committed under architecture/reports/part-0N/
 * so the landing's Rules cards and the architecture page can show a real
 * result and the commit it was for, instead of a claim.
 */
export interface RulesSnapshot {
  schema: 2;
  part: number;
  generatedAt: string;
  commit: string;
  /** True if files outside architecture/reports had uncommitted changes, so the result is not exactly `commit`. */
  dirty: boolean;
  ref: string;
  source: "local" | "github-actions";
  passed: boolean;
  checks: SnapshotCheck[];
}

export interface CalmRun {
  status: number | null;
  output: string;
}

export interface SnapshotDeps {
  runChecks: (repoRoot: string, boundaries: { runner: (root: string) => BoundariesRun }) => CheckResult[];
  runBoundaries: (repoRoot: string) => BoundariesRun;
  runCalm: (repoRoot: string, args: string[]) => CalmRun;
  commit: (repoRoot: string) => string;
  dirty: (repoRoot: string) => boolean;
  ref: (repoRoot: string) => string;
  now: () => Date;
  source: "local" | "github-actions";
}

function scrub(text: string, repoRoot: string): string {
  return text.split(`${repoRoot}/`).join("").split(repoRoot).join(".").split(`${homedir()}/`).join("~/");
}

function calmArgs(kind: "moment" | "timeline", file: string, outFile: string): string[] {
  return kind === "moment"
    ? ["validate", "-a", file, "-p", "architecture/calm/bullpen.pattern.json", "--strict", "-f", "json", "-o", outFile]
    : ["validate", "--timeline", file, "--strict", "-f", "json", "-o", outFile];
}

const lastLine = (text: string): string => text.trim().split("\n").filter(Boolean).pop() ?? "";

/**
 * Whether `rule` held in `result`: no violation names it, and no violation
 * names a rule the check does not list (a catch-all), which could be breaking
 * any of them.
 */
function ruleHeld(result: CheckResult, rule: string): boolean {
  const listed = new Set(result.rules);
  return result.violations.every((violation) => violation.rule !== rule && listed.has(violation.rule));
}

/** check:arch, in process: the result of each check, with its rules, and the text that backs it. */
function archCheck(results: CheckResult[], repoRoot: string): { check: SnapshotCheck; file: string } {
  const violations = results.flatMap((result) => result.violations);
  const passed = violations.length === 0;
  const text = passed
    ? `check:arch passed: ${results.length} checks held, ${results.reduce((n, r) => n + r.rules.length, 0)} rules enforced\n`
    : `${formatViolations(violations)}\n`;
  return {
    file: scrub(text, repoRoot),
    check: {
      id: "check-arch",
      name: "check:arch",
      command: "pnpm check:arch",
      passed,
      summary: lastLine(text),
      raw: "check-arch.txt",
      rules: results.flatMap((result) => result.rules.map((rule) => ({ id: ruleId(rule), rule, check: result.name, passed: ruleHeld(result, rule) }))),
    },
  };
}

/** `turbo boundaries` as a command of its own. */
function turboCheck(run: BoundariesRun, fallbackText: string, repoRoot: string): { check: SnapshotCheck; file: string } {
  const text = scrub(`${run.stdout}${run.stderr}` || fallbackText, repoRoot);
  return {
    file: text,
    check: {
      id: "turbo-boundaries",
      name: "turbo boundaries",
      command: "pnpm exec turbo boundaries",
      passed: run.status === 0,
      summary: lastLine(text) || (run.error ?? ""),
      raw: "turbo-boundaries.txt",
      rules: [],
    },
  };
}

interface CalmTarget {
  id: string;
  label: string;
  kind: "moment" | "timeline";
  file: string;
}

/** Every built moment, then the timeline. */
function calmTargets(repoRoot: string): CalmTarget[] {
  const momentsDir = join(repoRoot, "architecture", "calm", "moments");
  const names = existsSync(momentsDir) ? readdirSync(momentsDir).filter((name) => name.endsWith(".architecture.json")).sort() : [];
  const moments = names.map((name): CalmTarget => {
    const id = name.replace(".architecture.json", "");
    return { id: `calm-${id}`, label: `calm validate (${id})`, kind: "moment", file: `architecture/calm/moments/${name}` };
  });
  return [...moments, { id: "calm-timeline", label: "calm validate (timeline)", kind: "timeline", file: "architecture/calm/bullpen.timeline.json" }];
}

/** `calm validate --strict` on one target. Unreadable output counts as a failure. */
function calmCheck(target: CalmTarget, repoRoot: string, runCalm: SnapshotDeps["runCalm"]): { check: SnapshotCheck; file: string } {
  const scratch = mkdtempSync(join(tmpdir(), "calm-snapshot-"));
  const outFile = join(scratch, "result.json");
  const run = runCalm(repoRoot, calmArgs(target.kind, target.file, outFile));
  const output = existsSync(outFile) ? readFileSync(outFile, "utf8") : run.output;

  let result: { hasErrors?: boolean; hasWarnings?: boolean } = {};
  try {
    result = JSON.parse(output) as typeof result;
  } catch {
    /* stays empty, so `passed` below is false */
  }
  const passed = run.status === 0 && result.hasErrors === false && result.hasWarnings === false;
  return {
    file: `${scrub(output.trim() || JSON.stringify({ error: "no output" }), repoRoot)}\n`,
    check: {
      id: target.id,
      name: target.label,
      command: `npx ${CALM_CLI} ${calmArgs(target.kind, target.file, "<out>").join(" ")}`,
      passed,
      summary: passed ? "no errors, no warnings" : `hasErrors=${String(result.hasErrors)} hasWarnings=${String(result.hasWarnings)} exit=${String(run.status)}`,
      raw: `${target.id}.json`,
      rules: [],
    },
  };
}

/** Runs every rule check once and returns the snapshot plus the raw files that back it. */
export function buildSnapshot(repoRoot: string, part: number, deps: SnapshotDeps): { snapshot: RulesSnapshot; files: Record<string, string> } {
  // turbo's raw output is captured on the way through check:arch, as a fallback for its own command.
  let boundariesRaw = "";
  const results = deps.runChecks(repoRoot, {
    runner: (root) => {
      const run = deps.runBoundaries(root);
      boundariesRaw = `${run.stdout}${run.stderr}`;
      return run;
    },
  });

  const parts = [
    archCheck(results, repoRoot),
    turboCheck(deps.runBoundaries(repoRoot), boundariesRaw, repoRoot),
    ...calmTargets(repoRoot).map((target) => calmCheck(target, repoRoot, deps.runCalm)),
  ];
  const checks = parts.map((entry) => entry.check);
  const files = Object.fromEntries(parts.map((entry) => [entry.check.raw, entry.file]));

  return {
    files,
    snapshot: {
      schema: 2,
      part,
      generatedAt: deps.now().toISOString(),
      commit: deps.commit(repoRoot),
      dirty: deps.dirty(repoRoot),
      ref: deps.ref(repoRoot),
      source: deps.source,
      passed: checks.every((check) => check.passed),
      checks,
    },
  };
}

/** Writes summary.json and every raw file into `<reportsRoot>/part-0N/`. Returns that directory. */
export function writeSnapshot(reportsRoot: string, snapshot: RulesSnapshot, files: Record<string, string>): string {
  const dir = join(reportsRoot, `part-${String(snapshot.part).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  return dir;
}

const isCheck = (check: Partial<SnapshotCheck> | undefined): boolean =>
  typeof check?.id === "string" && typeof check.name === "string" && typeof check.passed === "boolean" && typeof check.raw === "string" && Array.isArray(check.rules);

/** The first field of `data` that is not what a snapshot needs, or null if all are. */
function firstProblem(data: Partial<RulesSnapshot>): string | null {
  if (data.schema !== 2) return `unknown schema ${JSON.stringify(data.schema)}`;
  if (typeof data.part !== "number" || !Number.isInteger(data.part)) return "missing integer part";
  const missingText = (["generatedAt", "commit", "ref"] as const).find((key) => typeof data[key] !== "string" || data[key] === "");
  if (missingText) return `missing ${missingText}`;
  const missingFlag = (["passed", "dirty"] as const).find((key) => typeof data[key] !== "boolean");
  if (missingFlag) return `missing ${missingFlag}`;
  if (!Array.isArray(data.checks) || data.checks.length === 0) return "missing checks";
  const malformed = data.checks.find((check) => !isCheck(check));
  return malformed ? `malformed check ${JSON.stringify((malformed as Partial<SnapshotCheck>).id)}` : null;
}

/** Validates a parsed summary.json; throws with the field that is wrong. */
export function parseSnapshot(content: string, label: string): RulesSnapshot {
  const data = JSON.parse(content) as Partial<RulesSnapshot>;
  const problem = firstProblem(data);
  if (problem) throw new Error(`${label}: ${problem}`);
  return data as RulesSnapshot;
}

export function realDeps(source: "local" | "github-actions"): SnapshotDeps {
  return {
    runChecks: (repoRoot, boundaries) => runChecks(repoRoot, { boundariesRunner: boundaries.runner }),
    runBoundaries: (repoRoot) => defaultBoundariesRunner(repoRoot),
    runCalm: (repoRoot, args) => {
      const result = spawnSync("npx", ["--yes", CALM_CLI, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 180_000 });
      return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
    },
    commit: (repoRoot) => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    dirty: (repoRoot) =>
      execFileSync("git", ["status", "--porcelain", "--", ".", ":(exclude)architecture/reports"], { cwd: repoRoot, encoding: "utf8" }).trim() !== "",
    ref: (repoRoot) => {
      const tag = spawnSync("git", ["describe", "--tags", "--exact-match"], { cwd: repoRoot, encoding: "utf8" });
      if (tag.status === 0) return tag.stdout.trim();
      return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    },
    now: () => new Date(),
    source,
  };
}
