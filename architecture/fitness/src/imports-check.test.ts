import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkEntryPointImports } from "./imports-check.js";
import { ADL_RULE } from "./rules.js";
import { expectFailureFormat, fixturesRoot, realRepoRoot } from "./test-helpers.js";

describe("checkEntryPointImports", () => {
  it("passes an app that imports the library entry point and a subpath the library publishes", () => {
    expect(checkEntryPointImports(join(fixturesRoot, "imports-ok"))).toEqual([]);
  });

  it("ignores a deep path that only appears in a comment or a string", () => {
    // imports-ok mentions fixture-ui/src/lib/format in both and still passes.
    expect(checkEntryPointImports(join(fixturesRoot, "imports-ok"))).toHaveLength(0);
  });

  it("fails a deep import of a library's source, naming the file, the line and the way out", () => {
    const violations = checkEntryPointImports(join(fixturesRoot, "imports-deep"));
    const deep = violations.find((v) => v.why.includes("fixture-ui/src/lib/format"));

    expect(deep).toBeDefined();
    expect(deep!.rule).toBe(ADL_RULE.entryPoint);
    expect(deep!.where).toBe("apps/app-a/src/index.ts:4");
    expect(deep!.fix).toContain('Import from "fixture-ui"');
  });

  it("fails a relative path that lands inside a library", () => {
    const violations = checkEntryPointImports(join(fixturesRoot, "imports-deep"));
    const relative = violations.find((v) => v.why.includes("relative path"));

    expect(relative).toBeDefined();
    expect(relative!.where).toBe("apps/app-a/src/index.ts:5");
    expect(relative!.why).toContain("packages/ui");
  });

  it("reports only the two bad imports, not the good one next to them", () => {
    expect(checkEntryPointImports(join(fixturesRoot, "imports-deep"))).toHaveLength(2);
  });

  it("fails in the shared format, citing the ADL", () => {
    const [violation] = checkEntryPointImports(join(fixturesRoot, "imports-deep"));
    const text = expectFailureFormat(violation!, "entry-point imports");
    expect(text).toContain(`✗ entry-point imports: ${ADL_RULE.entryPoint}`);
    expect(text).toMatch(/\(structure\.adl\)\.$/m);
  });

  it("passes the real repo, including the published @bullpen/ui/styles.css import", () => {
    expect(checkEntryPointImports(realRepoRoot)).toEqual([]);
  });
});
