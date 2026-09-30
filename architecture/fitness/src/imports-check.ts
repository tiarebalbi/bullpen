import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ADL_RULE, citeAdl } from "./rules.js";
import { lineAt, scanFiles } from "./source-scan.js";
import { toRepoPath, type Violation } from "./violation.js";

const CHECK = "entry-point imports";

interface Library {
  name: string;
  /** Repo-relative directory, e.g. `packages/ui`. */
  dir: string;
  /** Keys of package.json `exports` ("." and "./tokens.css"), or null if the package declares none. */
  exportKeys: string[] | null;
}

function loadLibraries(repoRoot: string): Library[] {
  const root = join(repoRoot, "packages");
  if (!existsSync(root)) return [];
  const libraries: Library[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const manifestPath = join(root, entry.name, "package.json");
    if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string; exports?: unknown };
    if (!manifest.name) continue;
    const exported = manifest.exports;
    libraries.push({
      name: manifest.name,
      dir: `packages/${entry.name}`,
      exportKeys: exported && typeof exported === "object" ? Object.keys(exported) : typeof exported === "string" ? ["."] : null,
    });
  }
  return libraries;
}

/** True if `subpath` (like "./tokens.css") is one the library publishes in its `exports`. */
function isPublished(library: Library, subpath: string): boolean {
  if (!library.exportKeys) return false;
  return library.exportKeys.some((key) => {
    if (key === subpath) return true;
    if (!key.includes("*")) return false;
    const pattern = new RegExp(`^${key.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", ".+")}$`);
    return pattern.test(subpath);
  });
}

const IMPORT_SPECIFIER = [
  /\bfrom\s*["']([^"']+)["']/g, // import x from "..." / export * from "..."
  /\bimport\s*["']([^"']+)["']/g, // import "..."
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("...")
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("...")
];

/**
 * "apps IMPORT libraries ONLY THROUGH their package entry point": an app
 * may import `@bullpen/ui` and whatever subpaths that package publishes in
 * its `exports`, never `@bullpen/ui/src/...` and never a relative path that
 * lands inside a library. `turbo boundaries` cannot express this (it checks
 * the dependency graph and imports that leave a package, not which door
 * into a library is used), so this check reads the imports itself.
 */
export function checkEntryPointImports(repoRoot: string): Violation[] {
  const libraries = loadLibraries(repoRoot);
  const violations: Violation[] = [];
  const rule = ADL_RULE.entryPoint;

  for (const file of scanFiles(repoRoot, ["apps"])) {
    const appDir = file.path.split("/").slice(0, 2).join("/");
    for (const pattern of IMPORT_SPECIFIER) {
      for (const match of file.code.matchAll(pattern)) {
        if (file.inString[match.index ?? 0]) continue; // the keyword sits inside a string, so this is text, not an import
        const specifier = match[1]!;
        const where = `${file.path}:${lineAt(file.code, match.index ?? 0)}`;

        if (specifier.startsWith(".")) {
          const target = toRepoPath(repoRoot, resolve(dirname(join(repoRoot, file.path)), specifier));
          const library = libraries.find((lib) => target === lib.dir || target.startsWith(`${lib.dir}/`));
          if (library) {
            violations.push({
              check: CHECK,
              rule,
              where,
              why: `${appDir} reaches into ${library.dir} with the relative path ${specifier}, instead of importing ${library.name} (${citeAdl(repoRoot, rule)}).`,
              fix: `Import from "${library.name}". If what you need is not exported, export it from ${library.dir}'s entry point.`,
            });
          }
          continue;
        }

        const library = libraries.find((lib) => specifier === lib.name || specifier.startsWith(`${lib.name}/`));
        if (!library || specifier === library.name) continue;
        const subpath = `.${specifier.slice(library.name.length)}`;
        if (isPublished(library, subpath)) continue;
        violations.push({
          check: CHECK,
          rule,
          where,
          why: `${appDir} imports ${specifier}, a deep path that ${library.name} does not publish in its exports (${citeAdl(repoRoot, rule)}).`,
          fix: `Import from "${library.name}" instead. If what you need is not exported, export it from ${library.dir}'s entry point (or add the subpath to its package.json exports).`,
        });
      }
    }
  }
  return violations;
}
