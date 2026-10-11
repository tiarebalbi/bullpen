import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlDocument } from "./adl.js";
import { ADL_RULE, checkAdlEnforced, citeAdl } from "./rules.js";
import { expectFailureFormat, realRepoRoot } from "./test-helpers.js";

function adlRepo(adl: string): string {
  const root = mkdtempSync(join(tmpdir(), "rules-"));
  mkdirSync(join(root, "architecture", "adl"), { recursive: true });
  writeFileSync(join(root, "architecture", "adl", "structure.adl"), adl);
  return root;
}

const HEADER = [
  "DESCRIPTION T",
  "CATEGORY Structural",
  "DEFINE SYSTEM S AS s",
  "  DEFINE COMPONENT A AS apps/a",
  "  DEFINE COMPONENT B AS apps/b",
  "  DEFINE LIBRARY L AS packages/l",
  "",
  "# Rules",
];
const FULL_ADL = [
  ...HEADER,
  ...Object.values(ADL_RULE).map((rule) => `ASSERT(${rule})`),
  "ASSERT(A IS DEPENDENT ON L)",
  "ASSERT(A HAS NO DEPENDENCY ON B)",
  "ASSERT(ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY)",
].join("\n");

describe("the real structure.adl", () => {
  const adl = readFileSync(join(realRepoRoot, "architecture", "adl", "structure.adl"), "utf8");
  const document = parseAdlDocument(adl, "architecture/adl/structure.adl");
  const texts = document.rules.map((rule) => rule.text);

  it("is in the book's format: DESCRIPTION and CATEGORY first, DEFINEs under DEFINE SYSTEM, asserts under # headings", () => {
    expect(adl.startsWith("DESCRIPTION ")).toBe(true);
    expect(document.category).toBe("Structural");
    expect(document.groups.map((group) => group.heading)).toEqual([
      "Structural assertions",
      "Allowed dependencies",
      "Disallowed dependencies (direct and transitive)",
      "Entry points and secrets",
      "Model currency",
    ]);
    expect(document.entries.filter((entry) => entry.kind !== "SYSTEM").every((entry) => /^ {2}DEFINE /.test(document.lines[entry.line - 1]!.raw))).toBe(true);
  });

  it("states every fixed rule verbatim, and both dependency verbs against named components", () => {
    for (const text of Object.values(ADL_RULE)) expect(texts).toContain(text);
    expect(texts).toContain("Landing IS DEPENDENT ON UI, Contracts");
    expect(texts).toContain("Landing HAS NO DEPENDENCY ON Trading App");
    expect(texts).toContain("ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY");
  });

  it("is fully enforced: every ASSERT has a check, and every check's rule is still written here", () => {
    expect(checkAdlEnforced(realRepoRoot)).toEqual([]);
  });

  it("has every rule enforced by form or by name, none left as documentation", () => {
    const fixed = new Set<string>(Object.values(ADL_RULE));
    for (const rule of document.rules) expect(fixed.has(rule.text) || rule.form.form !== "free", `"${rule.text}" has no check`).toBe(true);
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
    const root = adlRepo(FULL_ADL.replace(`ASSERT(${ADL_RULE.entryPoint})\n`, ""));
    const [violation] = checkAdlEnforced(root);

    expect(violation!.rule).toBe(ADL_RULE.entryPoint);
    expect(violation!.why).toContain("no longer states it");
    expect(violation!.fix).toContain(`ASSERT(${ADL_RULE.entryPoint})`);
  });

  it("accepts any number of dependency and secret rules, since they are enforced by their form", () => {
    const more = ["ASSERT(B IS DEPENDENT ON L)", "ASSERT(L HAS NO DEPENDENCY ON A, B)", "ASSERT(ONLY apps/web/app/api/other READS ANOTHER_KEY)"];
    expect(checkAdlEnforced(adlRepo(`${FULL_ADL}\n${more.join("\n")}`))).toEqual([]);
  });
});

describe("citeAdl", () => {
  it("points at the line that states the rule", () => {
    const root = adlRepo(FULL_ADL);
    const index = FULL_ADL.split("\n").indexOf(`ASSERT(${ADL_RULE.exists})`) + 1;
    expect(citeAdl(root, ADL_RULE.exists)).toBe(`structure.adl:${index}`);
  });

  it("falls back to the bare file name when the rule is not stated, or the file cannot be parsed", () => {
    expect(citeAdl(adlRepo(FULL_ADL), "a rule nobody wrote")).toBe("structure.adl");
    expect(citeAdl(adlRepo("DEFINE SYSTEM S AS s"), ADL_RULE.defined)).toBe("structure.adl");
  });
});
