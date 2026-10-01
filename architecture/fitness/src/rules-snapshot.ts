import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { BoundariesRun } from "./boundaries-check.js";
import { defaultBoundariesRunner } from "./boundaries-check.js";
import { runChecks, type CheckResult } from "./run-checks.js";
import { formatViolations } from "./violation.js";

export const CALM_CLI = "@finos/calm-cli@1.60.1";

export interface SnapshotRule {
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
  schema: 1;
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

/** Runs every rule check once and returns the snapshot plus the raw files that back it. */
export function buildSnapshot(repoRoot: string, part: number, deps: SnapshotDeps): { snapshot: RulesSnapshot; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const checks: SnapshotCheck[] = [];

  // check:arch, in process, with turbo's raw output captured on the way.
  let boundariesRaw = "";
  const results = deps.runChecks(repoRoot, {
    runner: (root) => {
      const run = deps.runBoundaries(root);
      boundariesRaw = `${run.stdout}${run.stderr}`;
      return run;
    },
  });
  const violations = results.flatMap((result) => result.violations);
  const archText = violations.length === 0 ? `check:arch passed: ${results.length} checks held, ${results.reduce((n, r) => n + r.rules.length, 0)} rules enforced\n` : `${formatViolations(violations)}\n`;
  files["check-arch.txt"] = scrub(archText, repoRoot);
  checks.push({
    id: "check-arch",
    name: "check:arch",
    command: "pnpm check:arch",
    passed: violations.length === 0,
    summary: archText.trim().split("\n").filter(Boolean).pop() ?? "",
    raw: "check-arch.txt",
    rules: results.flatMap((result) => result.rules.map((rule) => ({ rule, check: result.name, passed: result.violations.length === 0 }))),
  });

  // turbo boundaries, as a command of its own.
  const turbo = deps.runBoundaries(repoRoot);
  const turboText = scrub(`${turbo.stdout}${turbo.stderr}` || boundariesRaw, repoRoot);
  files["turbo-boundaries.txt"] = turboText;
  checks.push({
    id: "turbo-boundaries",
    name: "turbo boundaries",
    command: "pnpm exec turbo boundaries",
    passed: turbo.status === 0,
    summary: turboText.trim().split("\n").filter(Boolean).pop() ?? (turbo.error ?? ""),
    raw: "turbo-boundaries.txt",
    rules: [],
  });

  // calm validate --strict: every built moment, then the timeline.
  const momentsDir = join(repoRoot, "architecture", "calm", "moments");
  const moments = existsSync(momentsDir) ? readdirSync(momentsDir).filter((name) => name.endsWith(".architecture.json")).sort() : [];
  const targets = [
    ...moments.map((name) => ({ id: `calm-${name.replace(".architecture.json", "")}`, label: `calm validate (${name.replace(".architecture.json", "")})`, kind: "moment" as const, file: `architecture/calm/moments/${name}` })),
    { id: "calm-timeline", label: "calm validate (timeline)", kind: "timeline" as const, file: "architecture/calm/bullpen.timeline.json" },
  ];
  for (const target of targets) {
    const scratch = mkdtempSync(join(tmpdir(), "calm-snapshot-"));
    const outFile = join(scratch, "result.json");
    const run = deps.runCalm(repoRoot, calmArgs(target.kind, target.file, outFile));
    const output = existsSync(outFile) ? readFileSync(outFile, "utf8") : run.output;
    let result: { hasErrors?: boolean; hasWarnings?: boolean } = {};
    try {
      result = JSON.parse(output) as typeof result;
    } catch {
      /* unreadable output counts as a failure below */
    }
    const passed = run.status === 0 && result.hasErrors === false && result.hasWarnings === false;
    files[`${target.id}.json`] = `${scrub(output.trim() || JSON.stringify({ error: "no output" }), repoRoot)}\n`;
    checks.push({
      id: target.id,
      name: target.label,
      command: `npx ${CALM_CLI} ${calmArgs(target.kind, target.file, "<out>").join(" ")}`,
      passed,
      summary: passed ? "no errors, no warnings" : `hasErrors=${String(result.hasErrors)} hasWarnings=${String(result.hasWarnings)} exit=${String(run.status)}`,
      raw: `${target.id}.json`,
      rules: [],
    });
  }

  const snapshot: RulesSnapshot = {
    schema: 1,
    part,
    generatedAt: deps.now().toISOString(),
    commit: deps.commit(repoRoot),
    dirty: deps.dirty(repoRoot),
    ref: deps.ref(repoRoot),
    source: deps.source,
    passed: checks.every((check) => check.passed),
    checks,
  };
  return { snapshot, files };
}

/** Writes summary.json and every raw file into `<reportsRoot>/part-0N/`. Returns that directory. */
export function writeSnapshot(reportsRoot: string, snapshot: RulesSnapshot, files: Record<string, string>): string {
  const dir = join(reportsRoot, `part-${String(snapshot.part).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  return dir;
}

/** Validates a parsed summary.json; throws with the field that is wrong. */
export function parseSnapshot(content: string, label: string): RulesSnapshot {
  const data = JSON.parse(content) as Partial<RulesSnapshot>;
  const fail = (what: string): never => {
    throw new Error(`${label}: ${what}`);
  };
  if (data.schema !== 1) fail(`unknown schema ${JSON.stringify(data.schema)}`);
  if (typeof data.part !== "number" || !Number.isInteger(data.part)) fail("missing integer part");
  for (const key of ["generatedAt", "commit", "ref"] as const) if (typeof data[key] !== "string" || data[key] === "") fail(`missing ${key}`);
  if (typeof data.passed !== "boolean") fail("missing passed");
  if (typeof data.dirty !== "boolean") fail("missing dirty");
  if (!Array.isArray(data.checks) || data.checks.length === 0) fail("missing checks");
  for (const check of data.checks ?? []) {
    if (typeof check.id !== "string" || typeof check.name !== "string" || typeof check.passed !== "boolean" || typeof check.raw !== "string" || !Array.isArray(check.rules)) {
      fail(`malformed check ${JSON.stringify(check?.id)}`);
    }
  }
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
