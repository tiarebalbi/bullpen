import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlRules } from "./parse-adl.js";
import { ADL_RULE, SECRET_RULE_PATTERN, checkAdlEnforced, citeAdl } from "./rules.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

function adlRepo(adl: string): string {
  const root = mkdtempSync(join(tmpdir(), "rules-"));
  mkdirSync(join(root, "architecture", "adl"), { recursive: true });
  writeFileSync(join(root, "architecture", "adl", "structure.adl"), adl);
  return root;
}

const FULL_ADL = [
  "ADL: T",
  "DEFINE SYSTEM S AS s",
  ...Object.values(ADL_RULE).map((rule) => `ASSERT(${rule})`),
  "ASSERT(ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY)",
].join("\n");

describe("the real structure.adl", () => {
  const adl = readFileSync(join(realRepoRoot, "architecture", "adl", "structure.adl"), "utf8");
  const rules = parseAdlRules(adl).map((rule) => rule.text);

  it("says Part 2 in its description", () => {
    expect(adl).toContain("DESCRIPTION Apps and libraries that exist in Part 2");
  });

  it("states the three rules the brief adds, verbatim, after the original three", () => {
    expect(rules.slice(0, 3)).toEqual([ADL_RULE.defined, ADL_RULE.exists, ADL_RULE.appsNeverDependOnApps]);
    expect(rules).toContain("libraries NEVER DEPEND ON apps");
    expect(rules).toContain("apps IMPORT libraries ONLY THROUGH their package entry point");
    expect(rules).toContain("ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY");
  });

  it("is fully enforced: every ASSERT has a check, and every check's rule is still written here", () => {
    expect(checkAdlEnforced(realRepoRoot)).toEqual([]);
  });

  it("has every rule enforced by name, none left as documentation", () => {
    const enforced = new Set<string>(Object.values(ADL_RULE));
    for (const rule of rules) expect(enforced.has(rule) || SECRET_RULE_PATTERN.test(rule), `"${rule}" has no check`).toBe(true);
  });
});

describe("checkAdlEnforced", () => {
  it("passes an ADL that states exactly the rules the checks enforce", () => {
    expect(checkAdlEnforced(adlRepo(FULL_ADL))).toEqual([]);
  });

  it("fails an ASSERT nothing enforces: a rule that cannot fail a build is documentation", () => {
    const root = adlRepo(`${FULL_ADL}\nASSERT(every file is beautiful)`);
    const [violation] = checkAdlEnforced(root);

    expect(violation!.rule).toBe("every file is beautiful");
    expect(violation!.where).toBe(`architecture/adl/structure.adl:${FULL_ADL.split("\n").length + 1}`);
    expect(violation!.why).toContain("documentation, not a rule");
    expectFailureFormat(violation!, "rule coverage");
  });

  it("fails a rule a check still enforces but the ADL no longer states", () => {
    const root = adlRepo(FULL_ADL.replace(`ASSERT(${ADL_RULE.librariesNeverDependOnApps})\n`, ""));
    const [violation] = checkAdlEnforced(root);

    expect(violation!.rule).toBe(ADL_RULE.librariesNeverDependOnApps);
    expect(violation!.why).toContain("no longer states it");
    expect(violation!.fix).toContain(`ASSERT(${ADL_RULE.librariesNeverDependOnApps})`);
  });

  it("accepts any number of `ONLY <dir> READS <NAME>` rules", () => {
    expect(checkAdlEnforced(adlRepo(`${FULL_ADL}\nASSERT(ONLY apps/web/app/api/other READS ANOTHER_KEY)`))).toEqual([]);
  });
});

describe("citeAdl", () => {
  it("points at the line that states the rule", () => {
    const root = adlRepo(FULL_ADL);
    const index = FULL_ADL.split("\n").indexOf(`ASSERT(${ADL_RULE.appsNeverDependOnApps})`) + 1;
    expect(citeAdl(root, ADL_RULE.appsNeverDependOnApps)).toBe(`structure.adl:${index}`);
  });

  it("falls back to the bare file name when the rule is not stated", () => {
    expect(citeAdl(adlRepo("DEFINE SYSTEM S AS s"), ADL_RULE.defined)).toBe("structure.adl");
  });
});
