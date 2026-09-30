import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl, tokenizeAdlRule } from "./adl.js";

const adlPath = join(import.meta.dirname, "..", "..", "..", "architecture", "adl", "structure.adl");

describe("parseAdl", () => {
  it("parses the real architecture/adl/structure.adl", () => {
    const content = readFileSync(adlPath, "utf8");
    const adl = parseAdl(content);

    expect(adl.entries.length).toBeGreaterThanOrEqual(4);
    expect(adl.entries).toContainEqual({ kind: "COMPONENT", name: "Landing", path: "apps/landing" });
    expect(adl.entries).toContainEqual({ kind: "COMPONENT", name: "Trading App", path: "apps/web" });
    expect(adl.rules.some((rule) => /apps NEVER DEPEND ON other apps/.test(rule))).toBe(true);
  });

  it("throws a clear error when there are no DEFINE entries", () => {
    expect(() => parseAdl("ASSERT(something)")).toThrow(/no DEFINE/);
  });

  it("throws a clear error when there are no ASSERT rules", () => {
    expect(() => parseAdl("DEFINE SYSTEM Bullpen AS bullpen")).toThrow(/no ASSERT/);
  });

  it("handles a multi-word DEFINE name correctly (greedy split on the last AS)", () => {
    const adl = parseAdl("DEFINE COMPONENT Trading App AS apps/web\nASSERT(x)");
    expect(adl.entries[0]).toEqual({ kind: "COMPONENT", name: "Trading App", path: "apps/web" });
  });
});

describe("tokenizeAdlRule", () => {
  it("highlights DEFINED as a keyword", () => {
    const tokens = tokenizeAdlRule("every directory under apps/ and packages/ is DEFINED here");
    expect(tokens.some((t) => t.keyword && t.text === "DEFINED")).toBe(true);
    expect(tokens.filter((t) => t.keyword)).toHaveLength(1);
  });

  it("highlights the multi-word NEVER DEPEND ON as one keyword token, not split", () => {
    const tokens = tokenizeAdlRule("apps NEVER DEPEND ON other apps");
    const keywordTokens = tokens.filter((t) => t.keyword);
    expect(keywordTokens).toHaveLength(1);
    expect(keywordTokens[0]!.text).toBe("NEVER DEPEND ON");
  });

  it("highlights the vocabulary of the entry-point and secret rules, taking ONLY THROUGH whole", () => {
    const entry = tokenizeAdlRule("apps IMPORT libraries ONLY THROUGH their package entry point");
    expect(entry.filter((t) => t.keyword).map((t) => t.text)).toEqual(["IMPORT", "ONLY THROUGH"]);

    const secret = tokenizeAdlRule("ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY");
    expect(secret.filter((t) => t.keyword).map((t) => t.text)).toEqual(["ONLY", "READS"]);
  });

  it("returns the rule unchanged (as one non-keyword token) when it has no known keyword", () => {
    const tokens = tokenizeAdlRule("nothing special here");
    expect(tokens).toEqual([{ text: "nothing special here", keyword: false }]);
  });

  it("tokenizes every real rule in structure.adl without throwing", () => {
    const adl = parseAdl(readFileSync(adlPath, "utf8"));
    for (const rule of adl.rules) {
      expect(() => tokenizeAdlRule(rule)).not.toThrow();
      expect(tokenizeAdlRule(rule).some((t) => t.keyword)).toBe(true);
    }
  });
});
