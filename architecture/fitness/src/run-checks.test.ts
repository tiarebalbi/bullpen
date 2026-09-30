import { describe, expect, it } from "vitest";
import { CHECKS, runChecks } from "./run-checks.js";
import { realRepoRoot } from "./test-helpers.js";
import { formatViolations } from "./violation.js";

describe("check:arch on the real repo", () => {
  it("holds: every check passes, and a failure would print in the shared format", () => {
    const results = runChecks(realRepoRoot);
    const violations = results.flatMap((result) => result.violations);
    expect(violations.length === 0 ? "" : formatViolations(violations)).toBe("");
  }, 180_000);

  it("runs each check once, under the name its failures print", () => {
    const names = CHECKS.map((check) => check.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      "structure",
      "turbo boundaries",
      "entry-point imports",
      "secret containment",
      "model currency",
      "budget",
      "explorer consistency",
      "email in files",
      "rule coverage",
    ]);
  });
});
