import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Built from parts so this file does not contain the host it forbids.
const OLD_HOST = ["bullpen", "web", "nine"].join("-");
const NEW_HOST = "bullpen-app.tiarebalbi.com";
const SKIP = new Set(["node_modules", ".next", ".git", ".turbo", ".generated", "test-results", "design", "reports", "raw"]);
const TEXT = /\.(ts|tsx|js|mjs|json|css|md|html|adl)$/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (TEXT.test(name)) yield path;
  }
}

describe("the trading app's host", () => {
  it("the old .vercel.app host appears nowhere in the code, the model, the content or the docs", () => {
    const found = [];
    for (const root of ["apps", "packages", "architecture", "content", "docs"]) {
      for (const file of files(join(repoRoot, root))) if (readFileSync(file, "utf8").includes(OLD_HOST)) found.push(file.slice(repoRoot.length + 1));
    }
    expect(found).toEqual([]);
  });

  it("the landing's link and the app's canonical URL both name the production domain", () => {
    expect(readFileSync(join(repoRoot, "apps", "landing", "app", "lib", "webAppUrl.ts"), "utf8")).toContain(`https://${NEW_HOST}`);
    expect(readFileSync(join(repoRoot, "apps", "web", "app", "layout.tsx"), "utf8")).toContain(`https://${NEW_HOST}`);
  });
});
