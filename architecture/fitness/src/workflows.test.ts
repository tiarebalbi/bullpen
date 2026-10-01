import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const text = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

describe("ci.yml", () => {
  it("has a commit-policy job on pull requests, over the PR's own SHAs", () => {
    expect(text).toMatch(/\n  commit-policy:\n\s+if: github\.event_name == 'pull_request'/);
    expect(text).toContain("BASE_SHA: ${{ github.event.pull_request.base.sha }}");
    expect(text).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
  });

  it("runs the commit-policy script of the fitness package, with the whole history fetched", () => {
    expect(text).toContain("run: pnpm --filter @bullpen/fitness-checks run commit-policy");
    const job = text.slice(text.indexOf("\n  commit-policy:"));
    expect(job).toContain("fetch-depth: 0");
  });
});
