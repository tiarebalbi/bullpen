import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

const workflow = (name: string): string => readFileSync(join(realRepoRoot, ".github", "workflows", name), "utf8");

describe("rules-snapshot workflow", () => {
  const text = workflow("rules-snapshot.yml");

  it("runs on dispatch and on post-* tags, and only then", () => {
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).toMatch(/tags:\s*\n\s*- "post-\*"/);
    expect(text).not.toMatch(/\n\s{2}pull_request:/);
    expect(text).not.toMatch(/branches:/);
  });

  it("never pushes to main: it pushes a branch and opens a pull request into main", () => {
    expect(text).toMatch(/git push origin "HEAD:refs\/heads\/\$\{BRANCH\}"/);
    expect(text).not.toMatch(/git push[^\n]*\bmain\b/);
    expect(text).not.toMatch(/--force|\s-f\s|--force-with-lease/);
    expect(text).toMatch(/gh pr create --base main --head "\$BRANCH"/);
    expect(text).toMatch(/BRANCH="rules-snapshot\//);
  });

  it("commits as the repo identity from repository variables, with no address in the file and no trailer", () => {
    expect(text).toContain("vars.COMMIT_AUTHOR_NAME");
    expect(text).toContain("vars.COMMIT_AUTHOR_EMAIL");
    // An action pin like `pnpm/action-setup@v6.1.0` is not an address.
    expect(text).not.toMatch(/[\w.+-]+@(?!v\d)[\w-]+\.[\w.-]+/);
    expect(text.toLowerCase()).not.toContain("co-authored-by");
  });

  it("takes untrusted input through the environment, not interpolated into the script", () => {
    expect(text).toContain("INPUT_PART: ${{ inputs.part }}");
    expect(text).not.toMatch(/run: [^\n]*\$\{\{ inputs\.part \}\}/);
    expect(text).not.toMatch(/\$\{\{ github\.event\.[^}]*(title|body|ref)[^}]*\}\}/);
  });

  it("still fails the job when a check failed, after writing and reporting the result", () => {
    expect(text).toMatch(/if: steps\.run\.outputs\.status != '0'/);
  });
});

describe("ci workflow", () => {
  const text = workflow("ci.yml");

  it("runs check:arch and the guardrail tests outside --affected, so an app-only change cannot skip them", () => {
    const affected = /pnpm exec turbo run ([^\n]*) --affected/.exec(text)?.[1] ?? "";
    expect(affected).not.toContain("check:arch");
    expect(text).toMatch(/- name: check:arch \(always\)\n\s+run: pnpm check:arch/);
    expect(text).toMatch(/- name: guardrail tests \(always\)\n\s+run: pnpm --filter @bullpen\/fitness-checks test/);
  });

  it("runs on pushes to experiment branches too, so an experiment gets CI without a pull request", () => {
    expect(text).toMatch(/push:[\s\S]*?branches: \[[^\]]*"experiment\/\*\*"[^\]]*\]/);
    expect(text).toMatch(/\n  pull_request:/);
  });

  it("has a commit-policy job on pull requests, over the PR's own SHAs", () => {
    expect(text).toMatch(/\n  commit-policy:\n\s+if: github\.event_name == 'pull_request'/);
    expect(text).toContain("BASE_SHA: ${{ github.event.pull_request.base.sha }}");
    expect(text).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
  });

  it("validates both moments and the timeline with calm --strict", () => {
    for (const target of ["moments/part-01.architecture.json", "moments/part-02.architecture.json", "--timeline architecture/calm/bullpen.timeline.json"]) {
      expect(text).toContain(target);
    }
    expect((text.match(/--strict/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
