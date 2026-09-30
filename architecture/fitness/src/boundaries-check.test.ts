import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  BOUNDARIES_RULE,
  checkBoundaries,
  parseBoundariesOutput,
  type BoundariesRun,
} from "./boundaries-check.js";
import { ADL_RULE } from "./rules.js";
import { expectFailureFormat, expectNoAbsolutePaths, fixturesRoot } from "./test-helpers.js";
import type { Violation } from "./violation.js";

// The first invocation may fetch the standalone turbo binary via npx, which
// can be slow, so the real-mechanism runs get a generous timeout.
const TIMEOUT_MS = 180_000;

const fixture = (name: string) => join(fixturesRoot, name);

describe("turbo boundaries, through the wrapper (real mechanism, no mocking)", () => {
  const results = new Map<string, Violation[]>();
  const run = (name: string): Violation[] => results.get(name)!;

  it(
    "runs turbo against every fixture",
    () => {
      for (const name of ["boundaries-good", "boundaries-violation", "boundaries-library-violation", "boundaries-relative-import"]) {
        results.set(name, checkBoundaries(fixture(name)));
      }
    },
    TIMEOUT_MS,
  );

  it("passes when app-a does not depend on / import app-b", () => {
    expect(run("boundaries-good")).toEqual([]);
  });

  it("fails an app that depends on another app, with the ADL rule and the package.json to edit", () => {
    const [violation] = run("boundaries-violation");

    expect(run("boundaries-violation")).toHaveLength(1);
    expect(violation!.check).toBe("turbo boundaries");
    expect(violation!.rule).toBe(ADL_RULE.appsNeverDependOnApps);
    expect(violation!.where).toBe("apps/app-a/package.json");
    expect(violation!.why).toContain("app-a depends on app-b");
    expect(violation!.fix).toContain("Remove app-b from app-a's dependencies");
  });

  it("fails a library that depends on an app", () => {
    const [violation] = run("boundaries-library-violation");

    expect(run("boundaries-library-violation")).toHaveLength(1);
    expect(violation!.rule).toBe(ADL_RULE.librariesNeverDependOnApps);
    expect(violation!.where).toBe("packages/lib-a/package.json");
    expect(violation!.why).toContain("Library lib-a depends on app-a");
  });

  it("fails a relative import that reaches into another app, naming file and line", () => {
    const [violation] = run("boundaries-relative-import");

    expect(run("boundaries-relative-import")).toHaveLength(1);
    expect(violation!.rule).toBe(ADL_RULE.appsNeverDependOnApps);
    expect(violation!.where).toBe("apps/app-a/src/index.ts:1");
    expect(violation!.why).toContain("resolves into apps/app-b");
    expect(violation!.fix).toContain("package under packages/");
  });

  it("fails in the shared format with repo-relative paths only, even though turbo prints absolute ones", () => {
    for (const name of ["boundaries-violation", "boundaries-library-violation", "boundaries-relative-import"]) {
      const text = expectFailureFormat(run(name)[0]!, "turbo boundaries");
      expectNoAbsolutePaths(text);
      expect(text).toContain("✗ turbo boundaries: ");
    }
  });
});

describe("parseBoundariesOutput", () => {
  const output = [
    "Checking packages...",
    "  x Package `app-b` found with tag listed in denylist for `app-a`: `app`",
    "   ,-[apps/app-b/turbo.json:1:12]",
    " 1 | { \"tags\": [\"app\"] }",
    "   :            ^^|^^",
    "   `----",
    "  `->   x denylist defined here",
    "          ,-[turbo.json:9:35]",
    "  x import `../../app-b/src/index.ts` leaves the package",
    "   ,-[/some/abs/path/apps/app-a/src/index.ts:3:23]",
    " 3 | import { hello } from \"../../app-b/src/index.ts\";",
    "",
    "Checked 2 files in 2 packages, 2 issues found",
  ].join("\n");

  it("finds each issue's message and the first location in its block", () => {
    const findings = parseBoundariesOutput(output);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ message: expect.stringContaining("denylist for `app-a`"), file: "apps/app-b/turbo.json", line: 1 });
    expect(findings[1]).toMatchObject({ message: expect.stringContaining("leaves the package"), file: "/some/abs/path/apps/app-a/src/index.ts", line: 3 });
  });

  it("ignores warnings and nested 'denylist defined here' notes", () => {
    expect(parseBoundariesOutput(" WARNING  lockfile not found\n  `->   x denylist defined here\nChecked 1 files in 1 packages, no issues found")).toEqual([]);
  });
});

describe("checkBoundaries fails closed", () => {
  const runner = (run: BoundariesRun) => () => run;
  const root = "/repo/root";

  it("reports turbo itself failing to start", () => {
    const [violation] = checkBoundaries(root, runner({ status: null, stdout: "", stderr: "", error: "spawn turbo ENOENT" }));
    expect(violation!.rule).toBe(BOUNDARIES_RULE);
    expect(violation!.why).toContain("could not run");
    expectFailureFormat(violation!, "turbo boundaries");
  });

  it("reports a non-zero exit with no issue it can name", () => {
    const [violation] = checkBoundaries(root, runner({ status: 1, stdout: "", stderr: "boom" }));
    expect(violation!.why).toContain("exited with status 1 without naming an issue");
  });

  it("passes a clean run", () => {
    expect(checkBoundaries(root, runner({ status: 0, stdout: "Checked 3 files in 2 packages, no issues found", stderr: "" }))).toEqual([]);
  });

  it("keeps an issue it does not recognise, quoting turbo", () => {
    const [violation] = checkBoundaries(root, runner({ status: 1, stdout: "", stderr: "  x something new turbo reports\n   ,-[apps/a/x.ts:2:1]\n" }));
    expect(violation!.rule).toBe(BOUNDARIES_RULE);
    expect(violation!.where).toBe("apps/a/x.ts:2");
    expect(violation!.why).toContain("something new turbo reports");
  });
});
