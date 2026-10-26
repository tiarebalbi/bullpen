import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_WEB_ORIGIN, WEB_URL_RULE, checkWebUrl } from "./web-url-check.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

const GOOD: Record<string, string> = {
  "apps/landing/lib/webUrlGuard.ts": `export const PRODUCTION_WEB_ORIGIN = "${PRODUCTION_WEB_ORIGIN}";\n`,
  "apps/landing/next.config.ts": `import { assertWebUrl } from "./lib/webUrlGuard";\nassertWebUrl(process.env.NEXT_PUBLIC_BULLPEN_WEB_URL, process.env.VERCEL_ENV);\nexport default {};\n`,
  "apps/landing/app/lib/webAppUrl.ts": `import { PRODUCTION_WEB_ORIGIN } from "../../lib/webUrlGuard.js";\nexport const BULLPEN_WEB_URL = process.env.NEXT_PUBLIC_BULLPEN_WEB_URL ?? PRODUCTION_WEB_ORIGIN;\n`,
};

function makeRepo(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "web-url-"));
  for (const [path, content] of Object.entries({ ...GOOD, ...overrides })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("checkWebUrl", () => {
  it("passes a repo whose guard, build config and fallback agree, with no env set", () => {
    expect(checkWebUrl(makeRepo(), {})).toEqual([]);
  });

  it("fails when the guard names a different production origin", () => {
    const root = makeRepo({ "apps/landing/lib/webUrlGuard.ts": `export const PRODUCTION_WEB_ORIGIN = "https://bullpen-web-git-old-tiare-balbis-projects.vercel.app";\n` });
    const found = checkWebUrl(root, {});
    expect(found).toHaveLength(1);
    expect(found[0]!.where).toBe("apps/landing/lib/webUrlGuard.ts");
    expect(found[0]!.why).toContain("https://bullpen-web-git-old-tiare-balbis-projects.vercel.app");
  });

  it("fails when the build config does not call the guard, even if a comment mentions it", () => {
    const root = makeRepo({ "apps/landing/next.config.ts": `// assertWebUrl(x, y) would go here\nexport default {};\n` });
    expect(checkWebUrl(root, {}).map((v) => v.where)).toEqual(["apps/landing/next.config.ts"]);
  });

  it("fails when the fallback is a URL literal instead of the shared constant", () => {
    const root = makeRepo({ "apps/landing/app/lib/webAppUrl.ts": `export const BULLPEN_WEB_URL = process.env.NEXT_PUBLIC_BULLPEN_WEB_URL ?? "${PRODUCTION_WEB_ORIGIN}";\n` });
    expect(checkWebUrl(root, {}).map((v) => v.where)).toEqual(["apps/landing/app/lib/webAppUrl.ts"]);
  });

  it("fails a tracked config file that sets the variable to another origin, and accepts the production one", () => {
    const stale = makeRepo({ ".env.production": "NEXT_PUBLIC_BULLPEN_WEB_URL=https://bullpen-web-git-old-tiare-balbis-projects.vercel.app\n" });
    execGit(stale);
    expect(checkWebUrl(stale, {}).map((v) => v.where)).toEqual([".env.production:1"]);

    const fine = makeRepo({ ".env.production": `NEXT_PUBLIC_BULLPEN_WEB_URL=${PRODUCTION_WEB_ORIGIN}\n` });
    execGit(fine);
    expect(checkWebUrl(fine, {})).toEqual([]);
  });

  it("checks the value in a production build's environment, and lets a preview or local one through", () => {
    const root = makeRepo();
    const stale = { VERCEL_ENV: "production", NEXT_PUBLIC_BULLPEN_WEB_URL: "https://bullpen-web-git-old-tiare-balbis-projects.vercel.app" };
    const found = checkWebUrl(root, stale);
    expect(found).toHaveLength(1);
    expect(found[0]!.where).toBe("NEXT_PUBLIC_BULLPEN_WEB_URL (environment)");
    expect(found[0]!.why).toContain("https://bullpen-web-git-old-tiare-balbis-projects.vercel.app");
    expect(checkWebUrl(root, { ...stale, VERCEL_ENV: "preview" })).toEqual([]);
    expect(checkWebUrl(root, { VERCEL_ENV: "production" })).toEqual([]);
    expect(checkWebUrl(root, { VERCEL_ENV: "production", NEXT_PUBLIC_BULLPEN_WEB_URL: PRODUCTION_WEB_ORIGIN })).toEqual([]);
  });

  it("fails in the shared format, citing ADR-0026, with nothing machine-specific", () => {
    const root = makeRepo({ "apps/landing/next.config.ts": "export default {};\n" });
    const text = expectFailureFormat(checkWebUrl(root, {})[0]!, "web url");
    expect(text).toContain(`✗ web url: ${WEB_URL_RULE}`);
    expect(text).toContain("(ADR-0026)");
  });

  it("passes the real repo", () => {
    expect(checkWebUrl(realRepoRoot, {})).toEqual([]);
  });
});

function execGit(root: string): void {
  // The scan lists tracked and new, unignored files, so a repo needs git to have any.
  const run = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  run(["init", "-b", "main"]);
}
