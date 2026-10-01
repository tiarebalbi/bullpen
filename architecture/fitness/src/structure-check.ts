import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findAdlFile, type AdlEntry } from "./adl.js";
import { ADL_RULE, citeAdl } from "./rules.js";
import type { Violation } from "./violation.js";

const WATCHED_ROOTS = ["apps", "packages"] as const;
const CHECK = "structure";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Enforces the two structural ASSERTs of structure.adl against a real repo
 * (or fixture repo) rooted at `repoRoot`:
 *
 *   1. every directory that actually exists directly under apps/ and
 *      packages/ must be DEFINED in the ADL (as a COMPONENT or LIBRARY with
 *      a matching path).
 *   2. every COMPONENT/LIBRARY DEFINED in the ADL must exist as a real
 *      directory.
 *
 * The dependency rules (IS DEPENDENT ON, HAS NO DEPENDENCY ON) are enforced
 * by `turbo boundaries` through boundaries-check.ts, not here.
 *
 * Returns one violation per broken rule, empty when the repo is compliant.
 */
export function checkStructure(entries: AdlEntry[], repoRoot: string): Violation[] {
  const violations: Violation[] = [];
  const adlFile = findAdlFile(repoRoot) ?? "architecture/adl/structure.adl";

  const defined = entries.filter(
    (entry): entry is AdlEntry & { kind: "COMPONENT" | "LIBRARY" } => entry.kind === "COMPONENT" || entry.kind === "LIBRARY",
  );

  // Rule 1: every real directory under apps/ and packages/ must be DEFINED.
  for (const rootDir of WATCHED_ROOTS) {
    const fullRootDir = join(repoRoot, rootDir);
    if (!existsSync(fullRootDir)) continue;

    for (const dirent of readdirSync(fullRootDir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;

      const relPath = `${rootDir}/${dirent.name}`;
      if (defined.some((entry) => normalize(entry.path) === normalize(relPath))) continue;

      violations.push({
        check: CHECK,
        rule: ADL_RULE.defined,
        where: relPath,
        why: `${relPath} exists but ${adlFile} does not DEFINE it, so nothing says what it is or what may depend on it (${citeAdl(repoRoot, ADL_RULE.defined)}).`,
        fix: `Add \`DEFINE ${rootDir === "apps" ? "COMPONENT" : "LIBRARY"} <Name> AS ${relPath}\` to ${adlFile}, or remove the directory.`,
      });
    }
  }

  // Rule 2: every DEFINED component/library must exist as a real directory.
  for (const entry of defined) {
    const fullPath = join(repoRoot, entry.path);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) continue;

    violations.push({
      check: CHECK,
      rule: ADL_RULE.exists,
      where: entry.path,
      why: `${adlFile} DEFINEs ${entry.kind} "${entry.name}" at ${entry.path}, but no such directory exists (${citeAdl(repoRoot, ADL_RULE.exists)}).`,
      fix: `Create ${entry.path}, or remove its DEFINE line from ${adlFile}.`,
    });
  }

  return violations;
}
