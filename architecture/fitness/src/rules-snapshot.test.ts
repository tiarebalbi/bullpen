import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot, parseSnapshot, writeSnapshot, type SnapshotDeps } from "./rules-snapshot.js";
import type { CheckResult } from "./run-checks.js";
import { realRepoRoot } from "./test-helpers.js";

const GOOD_CHECKS: CheckResult[] = [
  { name: "structure", rules: ["rule one", "rule two"], violations: [] },
  { name: "budget", rules: ["rule three"], violations: [] },
];
const BAD_CHECKS: CheckResult[] = [
  { name: "structure", rules: ["rule one"], violations: [{ check: "structure", rule: "rule one", where: "apps/x", why: "because (ADR-0003).", fix: "fix it" }] },
  { name: "budget", rules: ["rule three"], violations: [] },
];

function repoWithMoments(names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "snapshot-"));
  mkdirSync(join(root, "architecture", "calm", "moments"), { recursive: true });
  for (const name of names) writeFileSync(join(root, "architecture", "calm", "moments", `${name}.architecture.json`), "{}");
  return root;
}

function deps(overrides: Partial<SnapshotDeps> = {}, root = "/work/repo"): SnapshotDeps {
  return {
    runChecks: () => GOOD_CHECKS,
    runBoundaries: () => ({ status: 0, stdout: `Checking packages...\nChecked 9 files in 2 packages, no issues found\n`, stderr: "" }),
    runCalm: (_root, args) => {
      writeFileSync(args[args.indexOf("-o") + 1]!, JSON.stringify({ hasErrors: false, hasWarnings: false }));
      return { status: 0, output: "" };
    },
    commit: () => "0123456789abcdef0123456789abcdef01234567",
    dirty: () => false,
    ref: () => "post-02-architecture-as-code",
    now: () => new Date("2026-10-01T12:00:00Z"),
    source: "local",
    ...overrides,
  };
  void root;
}

describe("buildSnapshot", () => {
  it("records every check with the commit, ref and time it ran for", () => {
    const root = repoWithMoments(["part-01", "part-02"]);
    const { snapshot } = buildSnapshot(root, 2, deps());

    expect(snapshot).toMatchObject({ schema: 1, part: 2, commit: "0123456789abcdef0123456789abcdef01234567", ref: "post-02-architecture-as-code", generatedAt: "2026-10-01T12:00:00.000Z", source: "local", dirty: false, passed: true });
    expect(snapshot.checks.map((c) => c.id)).toEqual(["check-arch", "turbo-boundaries", "calm-part-01", "calm-part-02", "calm-timeline"]);
  });

  it("lists each rule with the check that enforces it and whether that check held", () => {
    const { snapshot } = buildSnapshot(repoWithMoments(["part-01"]), 2, deps({ runChecks: () => BAD_CHECKS }));
    const archRules = snapshot.checks[0]!.rules;

    expect(archRules).toEqual([
      { rule: "rule one", check: "structure", passed: false },
      { rule: "rule three", check: "budget", passed: true },
    ]);
  });

  it("is not a pass when any check failed, and still says which", () => {
    const { snapshot, files } = buildSnapshot(repoWithMoments(["part-01"]), 2, deps({ runChecks: () => BAD_CHECKS }));
    expect(snapshot.passed).toBe(false);
    expect(snapshot.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual(["check-arch"]);
    expect(files["check-arch.txt"]).toContain("✗ structure: rule one");
  });

  it("fails a calm check that reports a warning, or exits non-zero", () => {
    const warn = buildSnapshot(repoWithMoments(["part-01"]), 2, deps({
      runCalm: (_r, args) => {
        writeFileSync(args[args.indexOf("-o") + 1]!, JSON.stringify({ hasErrors: false, hasWarnings: true }));
        return { status: 0, output: "" };
      },
    }));
    expect(warn.snapshot.checks.find((c) => c.id === "calm-part-01")!.passed).toBe(false);

    const crashed = buildSnapshot(repoWithMoments(["part-01"]), 2, deps({ runCalm: () => ({ status: 1, output: "boom" }) }));
    expect(crashed.snapshot.passed).toBe(false);
  });

  it("fails turbo boundaries on a non-zero exit", () => {
    const { snapshot } = buildSnapshot(repoWithMoments(["part-01"]), 2, deps({ runBoundaries: () => ({ status: 1, stdout: "", stderr: "x" }) }));
    expect(snapshot.checks.find((c) => c.id === "turbo-boundaries")!.passed).toBe(false);
  });

  it("scrubs the repo's absolute path and the home directory out of every raw file", () => {
    const root = repoWithMoments(["part-01"]);
    const { files } = buildSnapshot(root, 2, deps({
      runBoundaries: () => ({ status: 0, stdout: `see ${root}/turbo.json\n`, stderr: "" }),
    }));
    for (const [name, content] of Object.entries(files)) expect(content, name).not.toContain(root);
    expect(files["turbo-boundaries.txt"]).toContain("see turbo.json");
  });
});

describe("writeSnapshot and parseSnapshot", () => {
  it("writes summary.json and the raw files under part-0N/, and reads them back", () => {
    const root = repoWithMoments(["part-01"]);
    const { snapshot, files } = buildSnapshot(root, 2, deps());
    const reports = mkdtempSync(join(tmpdir(), "reports-"));
    const dir = writeSnapshot(reports, snapshot, files);

    expect(dir.endsWith("part-02")).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(["calm-part-01.json", "calm-timeline.json", "check-arch.txt", "summary.json", "turbo-boundaries.txt"]);
    expect(parseSnapshot(readFileSync(join(dir, "summary.json"), "utf8"), "summary.json")).toEqual(snapshot);
    for (const check of snapshot.checks) expect(existsSync(join(dir, check.raw)), check.raw).toBe(true);
  });

  it("rejects a summary that is not a snapshot", () => {
    expect(() => parseSnapshot("{}", "x")).toThrow(/unknown schema/);
    expect(() => parseSnapshot(JSON.stringify({ schema: 1, part: 2, generatedAt: "t", commit: "c", dirty: false, ref: "r", passed: true, checks: [] }), "x")).toThrow(/missing checks/);
  });
});

describe("the committed snapshots", () => {
  const reports = join(realRepoRoot, "architecture", "reports");
  const partDirs = existsSync(reports) ? readdirSync(reports).filter((name) => /^part-0\d$/.test(name)) : [];

  it("includes Part 2's snapshot, which this part commits", () => {
    expect(partDirs).toContain("part-02");
  });

  it.each(partDirs)("%s is a well-formed snapshot whose raw files exist and hold no machine path", (name) => {
    const dir = join(reports, name);
    const snapshot = parseSnapshot(readFileSync(join(dir, "summary.json"), "utf8"), `${name}/summary.json`);
    expect(`part-0${snapshot.part}`).toBe(name);
    expect(snapshot.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const check of snapshot.checks) {
      expect(existsSync(join(dir, check.raw)), `${name}/${check.raw}`).toBe(true);
      expect(readFileSync(join(dir, check.raw), "utf8")).not.toMatch(/\/(Users|home|private)\//);
    }
    expect(readFileSync(join(dir, "summary.json"), "utf8")).not.toMatch(/\/(Users|home|private)\//);
  });
});
