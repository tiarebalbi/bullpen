import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ADL_RULE, citeAdl } from "./rules.js";
import { isAbsolutePath, toRepoPath, type Violation } from "./violation.js";

const CHECK = "turbo boundaries";

/** Recorded in ADR-0003: the catch-all for anything turbo reports that no ADL rule names. */
export const BOUNDARIES_RULE = "turbo boundaries finds no dependency or import that crosses a package boundary";

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
 * Turbo prints each issue as an `  x <message>` line followed by a source
 * snippet whose first line names the location, `,-[path:line:col]`.
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
    const location = /^\s*,-\[(.+?):(\d+):(\d+)\]/.exec(line);
    if (location) {
      current.file = location[1]!;
      current.line = Number(location[2]);
    }
  }
  return findings;
}

/** Workspace package name -> repo-relative directory, for the places apps and libraries live. */
function loadPackageDirectories(repoRoot: string): Map<string, string> {
  const directories = new Map<string, string>();
  const candidates: string[] = ["architecture/fitness"];
  for (const root of ["apps", "packages"]) {
    const full = join(repoRoot, root);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { withFileTypes: true })) if (entry.isDirectory()) candidates.push(`${root}/${entry.name}`);
  }
  for (const dir of candidates) {
    const manifest = join(repoRoot, dir, "package.json");
    if (!existsSync(manifest)) continue;
    const name = (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
    if (name) directories.set(name, dir);
  }
  return directories;
}

/** Drops the machine-specific part of any absolute path in `text`. */
function withoutRoot(text: string, repoRoot: string): string {
  return text.split(`${repoRoot}/`).join("");
}

function topLevelFolder(repoPath: string): "apps" | "packages" | undefined {
  const first = repoPath.split("/")[0];
  return first === "apps" || first === "packages" ? first : undefined;
}

function appDirectory(repoPath: string): string {
  return repoPath.split("/").slice(0, 2).join("/");
}

function toViolation(finding: BoundaryFinding, repoRoot: string, packages: Map<string, string>): Violation | null {
  const message = withoutRoot(finding.message, repoRoot);

  const denied = /^Package `([^`]+)` found with tag listed in denylist for `([^`]+)`: `([^`]+)`/.exec(message);
  if (denied) {
    const [, dependency, dependent, tag] = denied as unknown as [string, string, string, string];
    const dependentDir = packages.get(dependent) ?? dependent;
    const fromLibrary = topLevelFolder(dependentDir) === "packages";
    const rule = fromLibrary ? ADL_RULE.librariesNeverDependOnApps : ADL_RULE.appsNeverDependOnApps;
    return {
      check: CHECK,
      rule,
      where: `${dependentDir}/package.json`,
      why: fromLibrary
        ? `Library ${dependent} depends on ${dependency}, which is tagged "${tag}", and a library must not know the apps that use it (${citeAdl(repoRoot, rule)}).`
        : `${dependent} depends on ${dependency}, which is tagged "${tag}", and apps may not depend on other apps (${citeAdl(repoRoot, rule)}).`,
      fix: fromLibrary
        ? `Remove ${dependency} from ${dependent}'s dependencies and move whatever it needed into the library.`
        : `Remove ${dependency} from ${dependent}'s dependencies, and move what the two share into a package under packages/ that both depend on.`,
    };
  }

  const leaves = /^import `([^`]+)` leaves the package/.exec(message);
  if (leaves && finding.file) {
    const specifier = leaves[1]!;
    const absoluteFile = isAbsolutePath(finding.file) ? finding.file : resolve(repoRoot, finding.file);
    const file = toRepoPath(repoRoot, absoluteFile);
    const where = finding.line ? `${file}:${finding.line}` : file;
    const target = toRepoPath(repoRoot, resolve(dirname(absoluteFile), specifier));
    const fromFolder = topLevelFolder(file);
    const toFolder = topLevelFolder(target);

    if (fromFolder === "apps" && toFolder === "packages") return null; // imports-check reports this, with the entry-point rule
    if (toFolder === "apps" && fromFolder) {
      const targetApp = appDirectory(target);
      if (fromFolder === "apps") {
        return {
          check: CHECK,
          rule: ADL_RULE.appsNeverDependOnApps,
          where,
          why: `${file} imports ${specifier}, which resolves into ${targetApp}, another app (${citeAdl(repoRoot, ADL_RULE.appsNeverDependOnApps)}).`,
          fix: `Do not import from ${targetApp}. Move the shared code into a package under packages/ and import it from that package's entry point.`,
        };
      }
      return {
        check: CHECK,
        rule: ADL_RULE.librariesNeverDependOnApps,
        where,
        why: `Library file ${file} imports ${specifier}, which resolves into ${targetApp}, an app (${citeAdl(repoRoot, ADL_RULE.librariesNeverDependOnApps)}).`,
        fix: `Remove the import; a library must not reach into an app. Move the shared code into the library instead.`,
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

  return {
    check: CHECK,
    rule: BOUNDARIES_RULE,
    where: finding.file ? `${isAbsolutePath(finding.file) ? toRepoPath(repoRoot, finding.file) : finding.file}${finding.line ? `:${finding.line}` : ""}` : "turbo.json",
    why: `turbo boundaries reports: ${message} (ADR-0003).`,
    fix: "Fix what turbo reports, then run `pnpm exec turbo boundaries` to confirm.",
  };
}

/**
 * Runs `turbo boundaries` and restates each issue as a violation of the ADL
 * rule it breaks. Fails closed: if turbo cannot run, or exits non-zero
 * without a parseable issue, that is itself a violation.
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

  const packages = loadPackageDirectories(repoRoot);
  const violations = parseBoundariesOutput(`${result.stderr}\n${result.stdout}`)
    .map((finding) => toViolation(finding, repoRoot, packages))
    .filter((violation): violation is Violation => violation !== null);

  if (result.status !== 0 && violations.length === 0) {
    return [unrunnable(`turbo boundaries exited with status ${result.status} without naming an issue`)];
  }
  return violations;
}
