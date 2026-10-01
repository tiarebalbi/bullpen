import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { findAdlFile, loadAdlDocument, type AdlDocument, type AdlEntry, type AdlRule } from "./adl.js";
import { BOUNDARIES_RULE, checkBoundaryTags, tagFor } from "./boundary-tags.js";
import { isAbsolutePath, toRepoPath, type Violation } from "./violation.js";

export { BOUNDARIES_RULE };

const CHECK = "turbo boundaries";

export interface BoundariesRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Set when the process could not be started at all. */
  error?: string;
}

export type BoundariesRunner = (repoRoot: string) => BoundariesRun;

/** The real mechanism: `turbo boundaries` in `repoRoot`, using the repo's own turbo if installed. */
export function defaultBoundariesRunner(repoRoot: string): BoundariesRun {
  const local = join(repoRoot, "node_modules", ".bin", "turbo");
  const [command, args] = existsSync(local) ? [local, ["boundaries"]] : ["npx", ["--yes", "turbo@2.11.4", "boundaries"]];
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: "1", TURBO_TELEMETRY_DISABLED: "1" },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message };
}

export interface BoundaryFinding {
  message: string;
  file?: string;
  line?: number;
}

/**
 * Turbo wraps a long message at 80 columns and marks each continuation line
 * with `  | `. It breaks after a `/` or `-` inside a name without a space, and at
 * a space otherwise, so a continuation joins directly after one of those two
 * characters and with a space after anything else.
 */
function joinWrapped(message: string, continuation: string): string {
  return /[/-]$/.test(message) ? message + continuation : `${message} ${continuation}`;
}

/**
 * Turbo prints each issue as an `  x <message>` line (wrapped, if long)
 * followed by a source snippet whose first line names the location,
 * `,-[path:line:col]`.
 */
export function parseBoundariesOutput(output: string): BoundaryFinding[] {
  const findings: BoundaryFinding[] = [];
  let current: BoundaryFinding | null = null;
  for (const line of output.split("\n")) {
    const header = /^ {2}x (.+)$/.exec(line);
    if (header) {
      current = { message: header[1]!.trim() };
      findings.push(current);
      continue;
    }
    if (/^Checked \d+ files?/.test(line)) current = null;
    if (!current || current.file) continue;
    const wrapped = /^ {2}\| (.+)$/.exec(line);
    if (wrapped) {
      current.message = joinWrapped(current.message, wrapped[1]!.trim());
      continue;
    }
    const location = /^\s*,-\[(.+?):(\d+):(\d+)\]/.exec(line);
    if (location) {
      current.file = location[1]!;
      current.line = Number(location[2]);
    }
  }
  return findings;
}

interface Workspace {
  /** Workspace package name -> repo-relative directory. */
  dirs: Map<string, string>;
  /** Workspace package name -> the workspace packages it lists as dependencies. */
  deps: Map<string, string[]>;
}

/** Every package the repo has under apps/ and packages/, and the architecture checks themselves. */
function loadWorkspace(repoRoot: string): Workspace {
  const candidates: string[] = ["architecture/fitness"];
  for (const root of ["apps", "packages"]) {
    const full = join(repoRoot, root);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { withFileTypes: true })) if (entry.isDirectory()) candidates.push(`${root}/${entry.name}`);
  }
  const manifests = new Map<string, { dir: string; listed: string[] }>();
  for (const dir of candidates) {
    const file = join(repoRoot, dir, "package.json");
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & { name?: string };
    if (!manifest.name) continue;
    const listed = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((key) => Object.keys((manifest[key] as Record<string, string> | undefined) ?? {}));
    manifests.set(manifest.name, { dir, listed });
  }
  const dirs = new Map([...manifests].map(([name, { dir }]) => [name, dir]));
  const deps = new Map([...manifests].map(([name, { listed }]) => [name, listed.filter((dependency) => manifests.has(dependency))]));
  return { dirs, deps };
}

/** The shortest chain of package.json dependencies from `from` to `to`, both ends included. */
function dependencyPath(workspace: Workspace, from: string, to: string): string[] | null {
  const previous = new Map<string, string>();
  const queue = [from];
  const seen = new Set(queue);
  for (const current of queue) {
    for (const next of workspace.deps.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
  return path;
}

/** Drops the machine-specific part of any absolute path in `text`. */
function withoutRoot(text: string, repoRoot: string): string {
  return text.split(`${repoRoot}/`).join("");
}

/** The DEFINEd component or library whose directory holds `repoPath`. */
function entryAt(adl: AdlDocument, repoPath: string): AdlEntry | undefined {
  return adl.entries.find((entry) => entry.kind !== "SYSTEM" && (repoPath === entry.path || repoPath.startsWith(`${entry.path}/`)));
}

type DependencyRule = AdlRule & { form: { form: "dependent-on" | "no-dependency-on"; subject: string; targets: string[] } };

function dependencyRule(adl: AdlDocument, form: DependencyRule["form"]["form"], subject: string, target?: string): DependencyRule | undefined {
  return adl.rules.find(
    (rule): rule is DependencyRule =>
      rule.form.form === form && rule.form.subject === subject && (target === undefined || rule.form.targets.includes(target)),
  );
}

interface Context {
  repoRoot: string;
  adl: AdlDocument | null;
  workspace: Workspace;
}

/** "Landing depends on Trading App", plus the chain of packages when it is not direct. */
function describeDependency(context: Context, path: string[] | null, subject: string, target: string, dependent: string, dependency: string): string {
  if (!path || path.length <= 2) return `${subject} depends on ${target}: ${dependent} lists ${dependency} in its package.json`;
  const through = path
    .slice(1, -1)
    .map((name) => entryAt(context.adl!, context.workspace.dirs.get(name) ?? "")?.name ?? name)
    .join(" and ");
  return `${subject} depends on ${target} through ${through}: ${path.join(" → ")}`;
}

/** The package.json that holds the last link of the chain, which is the one to edit. */
function lastLink(context: Context, path: string[] | null, dependent: string): { owner: string; where: string } {
  const owner = path && path.length >= 2 ? path[path.length - 2]! : dependent;
  return { owner, where: `${context.workspace.dirs.get(owner) ?? owner}/package.json` };
}

function deniedDependency(context: Context, dependency: string, dependent: string, tag: string): Violation | null {
  const { adl, workspace } = context;
  const subject = adl && entryAt(adl, workspace.dirs.get(dependent) ?? "");
  const target = adl?.entries.find((entry) => entry.kind !== "SYSTEM" && tagFor(entry.name) === tag);
  const rule = adl && subject && target ? dependencyRule(adl, "no-dependency-on", subject.name, target.name) : undefined;
  if (!rule || !subject || !target) return null;

  const path = dependencyPath(workspace, dependent, dependency);
  const { owner, where } = lastLink(context, path, dependent);
  const direct = !path || path.length <= 2;
  return {
    check: CHECK,
    rule: rule.text,
    where,
    why: `${describeDependency(context, path, subject.name, target.name, dependent, dependency)}, and it must not (structure.adl:${rule.line}).`,
    fix: direct
      ? `Remove ${dependency} from ${dependent}'s dependencies, and move what ${subject.name} and ${target.name} share into a library that both may depend on.`
      : `Remove ${dependency} from ${owner}'s dependencies, the last link of that chain, or move what ${subject.name} needs into a library that does not depend on ${target.name}.`,
  };
}

function unlistedDependency(context: Context, dependency: string, dependent: string): Violation | null {
  const { adl, workspace } = context;
  const subject = adl && entryAt(adl, workspace.dirs.get(dependent) ?? "");
  const rule = adl && subject ? dependencyRule(adl, "dependent-on", subject.name) : undefined;
  if (!adl || !subject || !rule) return null;

  const target = entryAt(adl, workspace.dirs.get(dependency) ?? "")?.name ?? dependency;
  const path = dependencyPath(workspace, dependent, dependency);
  const { owner, where } = lastLink(context, path, dependent);
  const allowed = adl.rules.flatMap((candidate) => (candidate.form.form === "dependent-on" && candidate.form.subject === subject.name ? candidate.form.targets : []));
  return {
    check: CHECK,
    rule: rule.text,
    where,
    why: `${describeDependency(context, path, subject.name, target, dependent, dependency)}, which is not on its allowed list (${allowed.join(", ")}) (structure.adl:${rule.line}).`,
    fix: `Remove ${dependency} from ${owner}'s dependencies. If ${subject.name} is meant to depend on ${target}, a new ADR changes the allowed list first.`,
  };
}

function leavingImport(context: Context, finding: BoundaryFinding, specifier: string): Violation | null {
  const { repoRoot, adl } = context;
  const absoluteFile = isAbsolutePath(finding.file!) ? finding.file! : resolve(repoRoot, finding.file!);
  const file = toRepoPath(repoRoot, absoluteFile);
  const where = finding.line ? `${file}:${finding.line}` : file;
  const target = toRepoPath(repoRoot, resolve(dirname(absoluteFile), specifier));
  const from = adl && entryAt(adl, file);
  const to = adl && entryAt(adl, target);

  // A component importing a library by path is the entry-point rule, which imports-check reports.
  if (from?.kind === "COMPONENT" && to?.kind === "LIBRARY") return null;
  const rule = adl && from && to && from !== to ? dependencyRule(adl, "no-dependency-on", from.name, to.name) : undefined;
  if (rule && from && to) {
    return {
      check: CHECK,
      rule: rule.text,
      where,
      why: `${file} imports ${specifier}, which resolves into ${to.path}, and ${from.name} must not depend on ${to.name} (structure.adl:${rule.line}).`,
      fix: `Do not import from ${to.path}. Move the shared code into a library that both may depend on, and import it from that library's entry point.`,
    };
  }
  return {
    check: CHECK,
    rule: BOUNDARIES_RULE,
    where,
    why: `${file} imports ${specifier}, which resolves outside its own package (ADR-0003).`,
    fix: "Import it through a declared package dependency instead of a relative path.",
  };
}

function toViolation(finding: BoundaryFinding, context: Context): Violation | null {
  const message = withoutRoot(finding.message, context.repoRoot);

  const denied = /^Package `([^`]+)` found with tag listed in denylist for `([^`]+)`: `([^`]+)`/.exec(message);
  if (denied) {
    const violation = deniedDependency(context, denied[1]!, denied[2]!, denied[3]!);
    if (violation) return violation;
  }

  const unlisted = /^Package `([^`]+)` found without any tag listed in allowlist for `([^`]+)`/.exec(message);
  if (unlisted) {
    const violation = unlistedDependency(context, unlisted[1]!, unlisted[2]!);
    if (violation) return violation;
  }

  const leaves = /^import `([^`]+)` leaves the package/.exec(message);
  if (leaves && finding.file) return leavingImport(context, finding, leaves[1]!);

  return {
    check: CHECK,
    rule: BOUNDARIES_RULE,
    where: finding.file ? `${isAbsolutePath(finding.file) ? toRepoPath(context.repoRoot, finding.file) : finding.file}${finding.line ? `:${finding.line}` : ""}` : "turbo.json",
    why: `turbo boundaries reports: ${message} (ADR-0003).`,
    fix: "Fix what turbo reports, then run `pnpm exec turbo boundaries` to confirm.",
  };
}

/**
 * Runs `turbo boundaries` and restates each issue as a violation of the ADL
 * rule it breaks, quoting the rule as it is written. Before that it holds
 * turbo.json to the ADL (checkBoundaryTags), so a rule cannot be dropped from
 * one and left in the other. Fails closed: if turbo cannot run, or exits
 * non-zero without a parseable issue, that is itself a violation.
 */
export function checkBoundaries(repoRoot: string, run: BoundariesRunner = defaultBoundariesRunner): Violation[] {
  const result = run(repoRoot);
  const unrunnable = (why: string): Violation => ({
    check: CHECK,
    rule: BOUNDARIES_RULE,
    where: "turbo.json",
    why: `${withoutRoot(why, repoRoot)} (ADR-0003).`,
    fix: "Run `pnpm exec turbo boundaries` and fix what it reports.",
  });

  if (result.error || result.status === null) return [unrunnable(`turbo boundaries could not run: ${result.error ?? "it was killed before finishing"}`)];

  const adl = findAdlFile(repoRoot) ? loadAdlDocument(repoRoot) : null;
  const context: Context = { repoRoot, adl, workspace: loadWorkspace(repoRoot) };
  const violations = parseBoundariesOutput(`${result.stderr}\n${result.stdout}`)
    .map((finding) => toViolation(finding, context))
    .filter((violation): violation is Violation => violation !== null);

  if (result.status !== 0 && violations.length === 0) {
    return [unrunnable(`turbo boundaries exited with status ${result.status} without naming an issue`)];
  }
  return [...(adl ? checkBoundaryTags(repoRoot, adl) : []), ...violations];
}
