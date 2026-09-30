import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { toRepoPath } from "./violation.js";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", ".generated", ".turbo", "dist", "coverage", "test-results", "playwright-report", ".git"]);

/** Every code file under `directory` (recursive), as absolute paths, skipping build output and dependencies. */
export function listCodeFiles(directory: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    let names: string[];
    try {
      names = readdirSync(current);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(name)) walk(path);
      } else if (CODE_EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) {
        files.push(path);
      }
    }
  };
  walk(directory);
  return files;
}

/**
 * Blanks out comments, keeping every newline and every string literal, so a
 * rule is judged on code and not on prose that happens to mention it. Line
 * numbers of what remains are unchanged. `inString[i]` is true when
 * character `i` of the result is inside a string literal's contents, so a
 * caller can tell the `from` in `import x from "y"` from the `from` in
 * `"not an import: from 'y'"`. Not a parser: regex literals and nested
 * template expressions are not special-cased.
 */
export function analyzeSource(source: string): { code: string; inString: boolean[] } {
  const out: string[] = [];
  const inString: boolean[] = [];
  const push = (text: string, string: boolean): void => {
    for (const char of text) {
      out.push(char);
      inString.push(string);
    }
  };

  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (quote) {
      if (c === "\\" && next !== undefined) {
        push(c + next, true);
        i += 2;
      } else if (c === quote) {
        push(c, false);
        quote = null;
        i += 1;
      } else {
        push(c, true);
        i += 1;
      }
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      push(c, false);
      i += 1;
    } else if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        push(" ", false);
        i += 1;
      }
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) push(source[i] === "\n" ? "\n" : " ", false);
    } else {
      push(c, false);
      i += 1;
    }
  }
  return { code: out.join(""), inString };
}

/** Comments blanked, strings kept: see `analyzeSource`. */
export function stripComments(source: string): string {
  return analyzeSource(source).code;
}

/** 1-based line number of `index` in `text`. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** A code file read once: its repo-relative path and its comment-free source. */
export interface ScannedFile {
  path: string;
  code: string;
  /** `inString[i]`: character `i` of `code` is inside a string literal. */
  inString: boolean[];
}

export function scanFiles(repoRoot: string, directories: string[]): ScannedFile[] {
  return directories
    .flatMap((directory) => listCodeFiles(join(repoRoot, directory)))
    .map((absolute) => ({ path: toRepoPath(repoRoot, absolute), ...analyzeSource(readFileSync(absolute, "utf8")) }));
}
