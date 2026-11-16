import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSweepWorkflow, cronMinGapMinutes } from "./sweep-workflow-check.js";
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
    expect(rules(without(/ *timeout-minutes: .*\n/))).toContain("the sweep job has a timeout");
    expect(rules(real.replace('timeout --signal=TERM "$limit" node', "node"))).toEqual(["the sweeper runs under `timeout --signal=TERM`"]);
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

describe("the schedule cut (ADR-0033, 2026-11-16)", () => {
  it("reads the real schedule as three crons, none closer than 30 minutes, the open run once a day", () => {
    expect(cronMinGapMinutes("22 14 * * 1-5")).toBe(24 * 60);
    expect(cronMinGapMinutes("7,37 15-20 * * 1-5")).toBe(30);
    expect(cronMinGapMinutes("17 */6 * * *")).toBe(6 * 60);
    expect(cronMinGapMinutes("*/5 * * * *")).toBe(5);
    expect(cronMinGapMinutes("0,15,30,45 * * * *")).toBe(15);
    expect(cronMinGapMinutes("*/20 * * * *")).toBe(20);
    expect(cronMinGapMinutes("0 * * * *")).toBe(60);
  });

  it("fails a schedule that runs more often than every 30 minutes", () => {
    expect(rules(real.replace('"17 */6 * * *"', '"*/5 * * * *"'))).toEqual(["no schedule runs more often than every 30 minutes"]);
    expect(rules(real.replace('"7,37 15-20 * * 1-5"', '"*/15 15-20 * * 1-5"'))).toEqual(["no schedule runs more often than every 30 minutes"]);
    const [bad] = checkSweepWorkflow(real.replace('"17 */6 * * *"', '"*/5 * * * *"'));
    expect(bad!.why).toContain('"*/5 * * * *" runs every 5 minutes');
  });

  it("fails an open run that can run longer than 20 minutes, in its seconds or in the job's minutes", () => {
    expect(rules(real.replace("limit=900", "limit=1500"))).toContain("the open run's time limit is at most 20 minutes");
    expect(rules(real.replace("'17'", "'25'"))).toContain("the job timeout is at most 20 minutes");
  });

  it("fails if the sweeper's timeout could outlast the job's, which GitHub would cancel", () => {
    expect(rules(real.replace("limit=900", "limit=1100"))).toContain("the sweeper's `timeout` ends before the job's");
  });

  it("reads the job timeout as a number: an expression without fromJSON fails", () => {
    expect(rules(real.replace("fromJSON(", "("))).toContain("the job timeout is a number");
  });

  it("fails if a run does not leave when idle", () => {
    expect(rules(real.replace('SWEEPER_EXIT_WHEN_IDLE: "1"', 'SWEEPER_EXIT_WHEN_IDLE: "0"'))).toEqual(["every run leaves when idle (SWEEPER_EXIT_WHEN_IDLE is 1)"]);
    expect(rules(without(/ *SWEEPER_EXIT_WHEN_IDLE: "1"\n/))).toEqual(["every run leaves when idle (SWEEPER_EXIT_WHEN_IDLE is 1)"]);
  });

  it("the hand run's mode is single or open: an unknown mode, a missing one or the wrong default fails", () => {
    expect(rules(real.replace("          - open\n", "          - open\n          - forever\n"))).toEqual(["the hand run's mode is single or open"]);
    expect(rules(real.replace("          - single\n", ""))).toEqual(["the hand run's mode is single or open"]);
    expect(rules(real.replace("default: single", "default: open"))).toEqual(["the hand run's mode defaults to single"]);
    expect(rules(without(/  workflow_dispatch:[\s\S]*?default: single\n/).replace("on:\n", "on:\n  workflow_dispatch:\n"))).toContain("the hand run's mode is single or open");
  });

  it("holds the three runs as the plan states them", () => {
    expect(real).toContain('cron: "22 14 * * 1-5"');
    expect(real).toContain('cron: "7,37 15-20 * * 1-5"');
    expect(real).toContain('cron: "17 */6 * * *"');
    expect(real).toContain("limit=900");
    expect(real).toContain("limit=120");
    expect(real).toContain("'17' || '4'");
  });
});

