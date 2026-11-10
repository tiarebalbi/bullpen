import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { findAdlFile, loadAdlDocument, type AdlRule } from "./adl.js";
import { importSites } from "./imports-check.js";
import { citeAdl } from "./rules.js";
import { scanFiles } from "./source-scan.js";
import { toRepoPath, type Violation } from "./violation.js";

const CHECK = "import boundaries";

type NoImportRule = AdlRule & { form: { form: "no-import"; directories: string[]; target: string } };

const isNoImportRule = (rule: AdlRule): rule is NoImportRule => rule.form.form === "no-import";

/** The package name of `directory` when it is a package (it has a package.json with a name), so `@bullpen/x` is caught as well as a relative path. */
function packageNameOf(repoRoot: string, directory: string): string | undefined {
  const manifest = join(repoRoot, directory, "package.json");
  if (!existsSync(manifest)) return undefined;
  return (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name;
}

const within = (path: string, directory: string): boolean => path === directory || path.startsWith(`${directory}/`);

/**
 * "NO <directories> IMPORTS <directory>": code under the first directories never imports the second, by a relative path or by the package's name. The
 * turbo boundaries check sees packages; this sees directories inside an app, where `apps/web/app/lib/trading` and `apps/web/app/lib/moderation` share one
 * package.json and so share every package-level rule.
 */
export function checkImportBoundaries(repoRoot: string): Violation[] {
  if (!findAdlFile(repoRoot)) return [];
  const rules = loadAdlDocument(repoRoot).rules.filter(isNoImportRule);
  if (rules.length === 0) return [];

  const violations: Violation[] = [];
  for (const rule of rules) {
    const { directories, target } = rule.form;
    const targetPackage = packageNameOf(repoRoot, target);
    const cite = citeAdl(repoRoot, rule.text);
    for (const file of scanFiles(repoRoot, directories)) {
      for (const site of importSites(file)) {
        const specifier = site.specifier;
        const resolved = specifier.startsWith(".") ? toRepoPath(repoRoot, resolve(dirname(join(repoRoot, file.path)), specifier)) : undefined;
        const hit = (resolved !== undefined && within(resolved, target)) || (targetPackage !== undefined && (specifier === targetPackage || specifier.startsWith(`${targetPackage}/`)));
        if (!hit) continue;
        violations.push({
          check: CHECK,
          rule: rule.text,
          where: site.where,
          why: `${file.path} imports ${specifier}, which is ${target}, and code in ${directories.join(", ")} may not (${cite}).`,
          fix: `Remove the import. If ${file.path} needs what ${target} does, move that into code both may import, or ask for a new decision (an ADR).`,
        });
      }
    }
  }
  return violations;
}
