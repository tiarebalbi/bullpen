import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AdlEntry } from "./parse-adl.js";

const WATCHED_ROOTS = ["apps", "packages"] as const;

const RULE_UNDECLARED_DIR =
  "every directory under apps/ and packages/ is DEFINED here";
const RULE_MISSING_DIR =
  "every DEFINED component and library exists as a directory";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Enforces the first two structural ASSERTs of structure.adl against a real
 * repo (or fixture repo) rooted at `repoRoot`:
 *
 *   1. every directory that actually exists directly under apps/ and
 *      packages/ must be DEFINED in the ADL (as a COMPONENT or LIBRARY with
 *      a matching path).
 *   2. every COMPONENT/LIBRARY DEFINED in the ADL must exist as a real
 *      directory.
 *
 * The third ASSERT ("apps NEVER DEPEND ON other apps") is enforced
 * separately by `turbo boundaries`, not by this check.
 *
 * Returns a list of human-readable violation messages, empty when the repo
 * is compliant.
 */
export function checkStructure(entries: AdlEntry[], repoRoot: string): string[] {
  const violations: string[] = [];

  const defined = entries.filter(
    (entry): entry is AdlEntry & { kind: "COMPONENT" | "LIBRARY" } =>
      entry.kind === "COMPONENT" || entry.kind === "LIBRARY",
  );

  // Rule 1: every real directory under apps/ and packages/ must be DEFINED.
  for (const rootDir of WATCHED_ROOTS) {
    const fullRootDir = join(repoRoot, rootDir);
    if (!existsSync(fullRootDir)) continue;

    const dirents = readdirSync(fullRootDir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;

      const relPath = `${rootDir}/${dirent.name}`;
      const isDefined = defined.some(
        (entry) => normalize(entry.path) === normalize(relPath),
      );

      if (!isDefined) {
        violations.push(
          `"${relPath}" exists under ${rootDir}/ but is not DEFINED in structure.adl (rule: ${RULE_UNDECLARED_DIR})`,
        );
      }
    }
  }

  // Rule 2: every DEFINED component/library must exist as a real directory.
  for (const entry of defined) {
    const fullPath = join(repoRoot, entry.path);
    const exists = existsSync(fullPath) && statSync(fullPath).isDirectory();

    if (!exists) {
      violations.push(
        `"${entry.path}" is DEFINED in structure.adl as ${entry.kind} "${entry.name}" but does not exist as a directory (rule: ${RULE_MISSING_DIR})`,
      );
    }
  }

  return violations;
}
