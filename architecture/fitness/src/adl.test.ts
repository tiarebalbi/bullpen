import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitAdlJson } from "./adl-emit.js";
import { AdlParseError, loadAdlDocument, parseAdlDocument, ruleId, slug, type AdlToken } from "./adl.js";
import { realRepoRoot } from "./test-helpers.js";

const HEADER = "DESCRIPTION A system\nCATEGORY Structural\nDEFINE SYSTEM Sys AS sys\n  DEFINE COMPONENT Landing AS apps/landing\n  DEFINE COMPONENT Trading App AS apps/web\n  DEFINE LIBRARY UI AS packages/ui\n  DEFINE LIBRARY Contracts AS packages/contracts\n";
const doc = (body: string, header = HEADER) => parseAdlDocument(`${header}\n${body}\n`, "x.adl");
const errorOf = (content: string): string => {
  try {
    parseAdlDocument(content, "x.adl");
  } catch (error) {
    expect(error).toBeInstanceOf(AdlParseError);
    return (error as Error).message;
  }
  throw new Error("expected a parse error");
};

describe("parseAdlDocument: the book's format", () => {
  const parsed = doc("# Allowed dependencies\nASSERT(Landing IS DEPENDENT ON UI, Contracts)\n\n# Other\n  # an indented comment\nASSERT(every DEFINED COMPONENT and LIBRARY exists as a directory)");

  it("reads DESCRIPTION and CATEGORY from the top", () => {
    expect(parsed.description).toBe("A system");
    expect(parsed.category).toBe("Structural");
  });

  it("reads DEFINEs indented under DEFINE SYSTEM, with names that contain spaces, and their lines", () => {
    expect(parsed.entries.map((entry) => [entry.kind, entry.name, entry.path, entry.line])).toEqual([
      ["SYSTEM", "Sys", "sys", 3],
      ["COMPONENT", "Landing", "apps/landing", 4],
      ["COMPONENT", "Trading App", "apps/web", 5],
      ["LIBRARY", "UI", "packages/ui", 6],
      ["LIBRARY", "Contracts", "packages/contracts", 7],
    ]);
  });

  it("groups each ASSERT under the # heading above it, keeping the heading's line", () => {
    expect(parsed.groups.map((group) => [group.heading, group.line, group.ruleIds.length])).toEqual([
      ["Allowed dependencies", 9, 1],
      ["Other", 12, 1],
    ]);
    expect(parsed.rules.map((rule) => [rule.group, rule.line])).toEqual([
      ["Allowed dependencies", 10],
      ["Other", 14],
    ]);
  });

  it("keeps every source line, comments and blank lines included, and the tokens join back to it", () => {
    expect(parsed.lines.map((line) => line.kind)).toEqual(["header", "header", "define", "define", "define", "define", "define", "blank", "comment", "assert", "blank", "comment", "comment", "assert"]);
    for (const line of parsed.lines) expect(line.tokens.map((token) => token.text).join("")).toBe(line.raw);
  });

  it("ignores a blank trailing newline and treats an indented # as a comment, not a heading", () => {
    expect(parsed.lines).toHaveLength(14);
    expect(parsed.groups.map((group) => group.heading)).not.toContain("an indented comment");
  });
});

describe("parseAdlDocument: dependency asserts", () => {
  it("reads IS DEPENDENT ON as an allow-list and HAS NO DEPENDENCY ON as a deny-list, with every target of a list", () => {
    const { rules } = doc("# R\nASSERT(Landing IS DEPENDENT ON UI, Contracts)\nASSERT(Trading App HAS NO DEPENDENCY ON Landing)\nASSERT(UI HAS NO DEPENDENCY ON Landing, Trading App)");
    expect(rules.map((rule) => rule.form)).toEqual([
      { form: "dependent-on", subject: "Landing", targets: ["UI", "Contracts"] },
      { form: "no-dependency-on", subject: "Trading App", targets: ["Landing"] },
      { form: "no-dependency-on", subject: "UI", targets: ["Landing", "Trading App"] },
    ]);
  });

  it("reads the secret form and leaves everything else as free text", () => {
    const { rules } = doc("# R\nASSERT(ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY)\nASSERT(every directory under apps and packages is DEFINED)");
    expect(rules[0]!.form).toEqual({ form: "secret", directory: "apps/web/app/api/price", secret: "COINGECKO_DEMO_API_KEY" });
    expect(rules[1]!.form).toEqual({ form: "free" });
  });

  it("gives each rule an id made from its text: the same wording is the same id wherever it sits in the file", () => {
    const first = doc("# R\nASSERT(Landing IS DEPENDENT ON UI)\nASSERT(Landing HAS NO DEPENDENCY ON Trading App)");
    const swapped = doc("# R\nASSERT(Landing HAS NO DEPENDENCY ON Trading App)\nASSERT(Landing IS DEPENDENT ON UI)");
    expect(first.rules.map((rule) => rule.id).sort()).toEqual(swapped.rules.map((rule) => rule.id).sort());
    expect(first.rules[1]!.id).toBe("landing-has-no-dependency-on-trading-app");
    expect(ruleId("Trading App HAS NO DEPENDENCY ON Landing")).toBe(slug("Trading App HAS NO DEPENDENCY ON Landing"));
  });
});

describe("parseAdlDocument: errors name the line", () => {
  const ok = `${HEADER}\n# R\n`;

  it("rejects the old header, naming it and the line", () => {
    expect(errorOf("ADL: BULLPEN\nTYPE Structural\nDESCRIPTION d\n")).toBe('x.adl:1: "ADL: BULLPEN" is the old header. The file starts with DESCRIPTION and CATEGORY lines.');
    expect(errorOf(`DESCRIPTION d\nTYPE Structural\n`)).toContain('x.adl:2: "TYPE Structural" is the old header');
  });

  it("rejects a line it cannot parse, quoting it", () => {
    expect(errorOf(`${ok}ASSERT every thing`)).toBe('x.adl:10: cannot parse "ASSERT every thing". A line is blank, a # comment, DESCRIPTION, CATEGORY, DEFINE, or ASSERT(...).');
  });

  it("rejects a name that is not DEFINEd, with its line", () => {
    expect(errorOf(`${ok}ASSERT(Landing IS DEPENDENT ON Nowhere)`)).toBe('x.adl:10: "Nowhere" is not a DEFINEd COMPONENT or LIBRARY.');
    expect(errorOf(`${ok}ASSERT(Sys IS DEPENDENT ON UI)`)).toContain('"Sys" is not a DEFINEd');
  });

  it("rejects a component that depends on itself, a repeated target, and a rule that contradicts another", () => {
    expect(errorOf(`${ok}ASSERT(UI HAS NO DEPENDENCY ON UI)`)).toContain('x.adl:10: "UI" cannot depend on itself.');
    expect(errorOf(`${ok}ASSERT(UI HAS NO DEPENDENCY ON Landing, Landing)`)).toContain("x.adl:10: a name is listed twice.");
    expect(errorOf(`${ok}ASSERT(Landing IS DEPENDENT ON UI)\nASSERT(Landing HAS NO DEPENDENCY ON UI)`)).toContain("x.adl:11: Landing may depend on UI (IS DEPENDENT ON) and may not (HAS NO DEPENDENCY ON).");
  });

  it("rejects the same rule twice, an ASSERT with no heading above it, and a tab used to indent", () => {
    expect(errorOf(`${ok}ASSERT(a rule)\nASSERT(a rule)`)).toContain("x.adl:11: the same rule as line 10.");
    expect(errorOf(`${HEADER}ASSERT(a rule)`)).toContain("x.adl:8: an ASSERT sits under a # heading, and there is none above it.");
    expect(errorOf(`${ok}\t# comment`)).toContain("x.adl:10: indent with spaces, not tabs");
  });

  it("holds DEFINEs to the indentation of the book's format", () => {
    expect(errorOf("DESCRIPTION d\nCATEGORY c\nDEFINE COMPONENT A AS apps/a\n")).toContain("x.adl:3: DEFINE COMPONENT comes after DEFINE SYSTEM.");
    expect(errorOf("DESCRIPTION d\nCATEGORY c\nDEFINE SYSTEM S AS s\nDEFINE COMPONENT A AS apps/a\n")).toContain("x.adl:4: DEFINE COMPONENT is indented under DEFINE SYSTEM.");
    expect(errorOf("DESCRIPTION d\nCATEGORY c\nDEFINE SYSTEM S AS s\n  DEFINE SYSTEM T AS t\n")).toContain("x.adl:4: a second DEFINE SYSTEM");
    expect(errorOf("DESCRIPTION d\nCATEGORY c\n  DEFINE SYSTEM S AS s\n")).toContain("x.adl:3: DEFINE SYSTEM starts in column 0.");
  });

  it("holds DESCRIPTION, CATEGORY and ASSERT to column 0, once, and present", () => {
    expect(errorOf("DESCRIPTION d\nDESCRIPTION e\n")).toContain("x.adl:2: a second DESCRIPTION.");
    expect(errorOf("DESCRIPTION d\n  CATEGORY c\n")).toContain("x.adl:2: DESCRIPTION and CATEGORY starts in column 0, not indented.");
    expect(errorOf(`${ok}  ASSERT(a rule)`)).toContain("x.adl:10: ASSERT starts in column 0, not indented.");
    expect(errorOf("DEFINE SYSTEM S AS s\n")).toContain("x.adl:1: no DESCRIPTION line.");
    expect(errorOf("DESCRIPTION d\nDEFINE SYSTEM S AS s\n")).toContain("x.adl:1: no CATEGORY line.");
    expect(errorOf("DESCRIPTION d\nCATEGORY c\n")).toContain("x.adl:1: no DEFINE SYSTEM line.");
  });

  it("names the repo-relative file when it reads one from a repo", () => {
    const root = mkdtempSync(join(tmpdir(), "adl-"));
    mkdirSync(join(root, "architecture", "adl"), { recursive: true });
    writeFileSync(join(root, "architecture", "adl", "structure.adl"), "TYPE Structural\n");
    expect(() => loadAdlDocument(root)).toThrow(/^architecture\/adl\/structure\.adl:1: /);
    expect(() => loadAdlDocument(mkdtempSync(join(tmpdir(), "adl-")))).toThrow(/not found/);
  });
});

describe("the tokens a line is split into", () => {
  const tokensOf = (body: string, index = 0): AdlToken[] => doc(`# R\n${body}`).lines.filter((line) => line.kind === "assert")[index]!.tokens;
  const kinds = (tokens: AdlToken[]) => tokens.filter((token) => token.kind !== "text").map((token) => `${token.kind}:${token.text}`);

  it("marks the book's keywords, longest phrase first, and the names of what is DEFINEd", () => {
    expect(kinds(tokensOf("ASSERT(Trading App IS DEPENDENT ON UI, Contracts)"))).toEqual([
      "keyword:ASSERT",
      "name:Trading App",
      "keyword:IS DEPENDENT ON",
      "name:UI",
      "name:Contracts",
    ]);
    expect(kinds(tokensOf("ASSERT(Landing HAS NO DEPENDENCY ON Trading App)"))).toContain("keyword:HAS NO DEPENDENCY ON");
    expect(kinds(tokensOf("ASSERT(COMPONENTS use LIBRARIES ONLY THROUGH their package entry point)"))).toEqual(["keyword:ASSERT", "keyword:COMPONENTS", "keyword:LIBRARIES", "keyword:ONLY THROUGH"]);
    expect(kinds(tokensOf("ASSERT(every DEFINED COMPONENT and LIBRARY exists as a directory)"))).toEqual(["keyword:ASSERT", "keyword:DEFINED", "keyword:COMPONENT", "keyword:LIBRARY"]);
  });

  it("marks paths and identifiers, and READS and ONLY as keywords", () => {
    expect(kinds(tokensOf("ASSERT(ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY)"))).toEqual([
      "keyword:ASSERT",
      "keyword:ONLY",
      "path:apps/web/app/api/price",
      "keyword:READS",
      "path:COINGECKO_DEMO_API_KEY",
    ]);
  });

  it("does not mark a word that only looks like a keyword or a name", () => {
    expect(kinds(tokensOf("ASSERT(every directory under apps and packages is DEFINED)"))).toEqual(["keyword:ASSERT", "keyword:DEFINED"]);
    expect(kinds(tokensOf("ASSERT(the UIs and Landings are fine as is)"))).toEqual(["keyword:ASSERT"]);
  });

  it("marks DEFINE lines structurally: keyword, kind, name, AS, path", () => {
    const line = doc("# R\nASSERT(x)").lines[4]!;
    expect(line.tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      "text:  ",
      "keyword:DEFINE",
      "text: ",
      "keyword:COMPONENT",
      "text: ",
      "name:Trading App",
      "text: ",
      "keyword:AS",
      "text: ",
      "path:apps/web",
    ]);
  });

  it("marks a # comment whole, after any indentation, and the header keyword only", () => {
    const parsed = doc("# Allowed dependencies\n  # indented\nASSERT(x)");
    expect(parsed.lines[8]!.tokens).toEqual([{ text: "# Allowed dependencies", kind: "comment" }]);
    expect(parsed.lines[9]!.tokens).toEqual([
      { text: "  ", kind: "text" },
      { text: "# indented", kind: "comment" },
    ]);
    expect(parsed.lines[0]!.tokens).toEqual([
      { text: "DESCRIPTION", kind: "keyword" },
      { text: " A system", kind: "text" },
    ]);
  });
});

describe("the real structure.adl", () => {
  const document = loadAdlDocument(realRepoRoot);

  it("parses, and every line's tokens join back to the line as written", () => {
    expect(document.rules.length).toBeGreaterThan(0);
    const source = readFileSync(join(realRepoRoot, "architecture", "adl", "structure.adl"), "utf8").split("\n");
    for (const line of document.lines) {
      expect(line.raw).toBe(source[line.number - 1]);
      expect(line.tokens.map((token) => token.text).join("")).toBe(line.raw);
    }
  });

  it("gives every rule an id that is unique and made from its wording", () => {
    const ids = document.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of document.rules) expect(rule.id).toBe(slug(rule.text));
  });
});

describe("emitAdlJson", () => {
  it("writes the parsed document for the landing page, with its source and schema", () => {
    const out = join(mkdtempSync(join(tmpdir(), "adl-emit-")), "nested", "adl.json");
    const json = emitAdlJson(realRepoRoot, out);
    const written = JSON.parse(readFileSync(out, "utf8")) as typeof json;

    expect(written.schema).toBe(1);
    expect(written.source).toBe("architecture/adl/structure.adl");
    expect(Object.keys(written).sort()).toEqual(["category", "description", "entries", "groups", "lines", "rules", "schema", "source"]);
    expect(written.rules.map((rule) => rule.id)).toEqual(loadAdlDocument(realRepoRoot).rules.map((rule) => rule.id));
  });

  it("fails, naming the line, rather than writing a page from a file it cannot read", () => {
    const root = mkdtempSync(join(tmpdir(), "adl-emit-"));
    mkdirSync(join(root, "architecture", "adl"), { recursive: true });
    writeFileSync(join(root, "architecture", "adl", "structure.adl"), "DESCRIPTION d\nCATEGORY c\nnonsense\n");
    expect(() => emitAdlJson(root, join(root, "out.json"))).toThrow(/structure\.adl:3: cannot parse "nonsense"/);
  });
});

describe("no ADL file in the repo is in the old format", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.adl"], { cwd: realRepoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  it("finds the real file and every fixture", () => {
    expect(files).toContain("architecture/adl/structure.adl");
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it("has no `ADL:` or `TYPE` header in any of them, and parses every one", () => {
    for (const file of files) {
      const content = readFileSync(join(realRepoRoot, file), "utf8");
      const oldHeader = content.split("\n").findIndex((line) => /^(ADL:|TYPE\s)/.test(line));
      expect(oldHeader, `${file}:${oldHeader + 1} uses the old header`).toBe(-1);
      expect(() => parseAdlDocument(content, file), file).not.toThrow();
    }
  });
});
