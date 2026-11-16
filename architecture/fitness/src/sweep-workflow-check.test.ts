import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSweepWorkflow } from "./sweep-workflow-check.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

const real = readFileSync(join(realRepoRoot, ".github", "workflows", "sweep.yml"), "utf8");
const rules = (text: string): string[] => checkSweepWorkflow(text).map((v) => v.rule);
const without = (pattern: RegExp): string => real.replace(pattern, "");

describe("the scheduled sweep workflow (ADR-0033)", () => {
  it("holds every rule as written", () => {
    expect(checkSweepWorkflow(real)).toEqual([]);
  });

  it("fails if it does not check out main", () => {
    expect(rules(real.replace("ref: main", "ref: part-05-publish"))).toEqual(["the sweep checks out main"]);
    expect(rules(without(/ *ref: main\n/))).toEqual(["the sweep checks out main"]);
  });

  it("fails on any write permission, or on permissions that are not empty", () => {
    expect(rules(real.replace("permissions: {}", "permissions:\n  contents: write"))).toContain("the sweep has no permissions and no write access");
    expect(rules(real.replace("permissions: {}", "permissions:\n  contents: read"))).toContain("the sweep has no permissions and no write access");
    expect(rules(without(/permissions: \{\}\n/))).toContain("the sweep has no permissions and no write access");
  });

  it("fails without a job timeout or without `timeout` on the run step", () => {
    expect(rules(without(/ *timeout-minutes: 6\n/))).toEqual(["the sweep job has a timeout"]);
    expect(rules(real.replace("timeout --signal=TERM 280 node", "node"))).toEqual(["the sweeper runs under `timeout --signal=TERM`"]);
  });

  it("fails without the SWEEP_FROM_ACTIONS gate or the date guard", () => {
    expect(rules(real.replace("vars.SWEEP_FROM_ACTIONS == 'on'", "true"))).toEqual(["the sweep runs only while SWEEP_FROM_ACTIONS is on"]);
    expect(rules(real.replaceAll("2026-12-01", "2027-01-01"))).toEqual(["the sweep stops on 2026-12-01 UTC"]);
  });

  it("fails if the token is anywhere but secrets.SWEEPER_TOKEN, and names the line", () => {
    const [bad] = checkSweepWorkflow(real.replace("${{ secrets.SWEEPER_TOKEN }}", "ghp_notarealtoken"));
    expect(bad!.rule).toBe("the token is only ever secrets.SWEEPER_TOKEN");
    expect(bad!.where).toMatch(/sweep\.yml:\d+$/);
    expect(rules(real.replace("secrets.SWEEPER_TOKEN", "secrets.OTHER"))).toContain("the token is only ever secrets.SWEEPER_TOKEN");
    expect(rules(real.replace("steps:", "steps:\n      - run: echo ${{ secrets.GITHUB_TOKEN }}"))).toContain("the sweep reads no secret but SWEEPER_TOKEN");
  });

  it("fails if the URL is written as text, in the variable or anywhere else", () => {
    expect(rules(real.replace("${{ vars.SWEEPER_TARGET_URL }}", "https://example.invalid/api/internal/sweep"))).toEqual(expect.arrayContaining(["the target URL is only ever vars.SWEEPER_TARGET_URL", "the sweep file holds no URL as text"]));
    expect(rules(real.replace("steps:", "steps:\n      - run: curl https://example.invalid/"))).toContain("the sweep file holds no URL as text");
  });

  it("does not count a rule that is only commented out", () => {
    expect(rules(real.replace("          ref: main", "          # ref: main"))).toEqual(["the sweep checks out main"]);
  });

  it("fails in the shared format", () => {
    const [bad] = checkSweepWorkflow(real.replace("ref: main", "ref: other"));
    expect(expectFailureFormat(bad!, "sweep workflow")).toContain("✗ sweep workflow: the sweep checks out main");
  });
});
