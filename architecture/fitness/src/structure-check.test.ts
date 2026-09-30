import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlFile } from "./parse-adl.js";
import { ADL_RULE } from "./rules.js";
import { checkStructure } from "./structure-check.js";
import { expectFailureFormat, fixturesRoot } from "./test-helpers.js";

function runFixture(name: string) {
  const fixtureRoot = join(fixturesRoot, name);
  const entries = parseAdlFile(join(fixtureRoot, "structure.adl"));
  return checkStructure(entries, fixtureRoot);
}

describe("checkStructure", () => {
  it("passes both asserts for a fully compliant fixture", () => {
    expect(runFixture("good")).toEqual([]);
  });

  it("flags a real directory under apps/ that isn't DEFINED in the ADL", () => {
    const violations = runFixture("undeclared-dir");
    const [violation] = violations.filter((v) => v.where === "apps/scratch");

    expect(violation).toBeDefined();
    expect(violation!.rule).toBe(ADL_RULE.defined);
    expect(violation!.fix).toContain("DEFINE COMPONENT");
  });

  it("does not flag directories that are correctly DEFINED alongside the undeclared one", () => {
    const wheres = runFixture("undeclared-dir").map((v) => v.where);
    expect(wheres).not.toContain("apps/one");
    expect(wheres).not.toContain("packages/two");
  });

  it("flags a DEFINED component/library whose directory doesn't exist", () => {
    const violations = runFixture("missing-declared-dir");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.where).toBe("packages/ghost");
    expect(violations[0]!.rule).toBe(ADL_RULE.exists);
  });

  it("fails in the shared format, with a repo-relative path", () => {
    expectFailureFormat(runFixture("undeclared-dir")[0]!, "structure");
    const text = expectFailureFormat(runFixture("missing-declared-dir")[0]!, "structure");
    expect(text).toContain("✗ structure: every DEFINED component and library exists as a directory");
  });
});
