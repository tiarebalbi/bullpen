import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAdlFile } from "./parse-adl.js";
import { checkStructure } from "./structure-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, "__fixtures__");

function runFixture(name: string) {
  const fixtureRoot = join(fixturesRoot, name);
  const entries = parseAdlFile(join(fixtureRoot, "structure.adl"));
  return checkStructure(entries, fixtureRoot);
}

describe("checkStructure", () => {
  it("passes both asserts for a fully compliant fixture", () => {
    const violations = runFixture("good");
    expect(violations).toEqual([]);
  });

  it("flags a real directory under apps/ that isn't DEFINED in the ADL", () => {
    const violations = runFixture("undeclared-dir");

    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some(
        (v) =>
          v.includes("apps/scratch") &&
          v.includes("every directory under apps/ and packages/ is DEFINED here"),
      ),
    ).toBe(true);
  });

  it("does not flag directories that are correctly DEFINED alongside the undeclared one", () => {
    const violations = runFixture("undeclared-dir");

    expect(violations.some((v) => v.includes("apps/one"))).toBe(false);
    expect(violations.some((v) => v.includes("packages/two"))).toBe(false);
  });

  it("flags a DEFINED component/library whose directory doesn't exist", () => {
    const violations = runFixture("missing-declared-dir");

    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some(
        (v) =>
          v.includes("packages/ghost") &&
          v.includes("every DEFINED component and library exists as a directory"),
      ),
    ).toBe(true);
  });

  it("reports exactly one violation for the missing-declared-dir fixture", () => {
    const violations = runFixture("missing-declared-dir");
    expect(violations).toHaveLength(1);
  });
});
