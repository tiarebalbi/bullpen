import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { groupLines, loadAdl, parseAdlJson } from "./adl.js";

const landingRoot = join(import.meta.dirname, "..");
const repoRoot = join(landingRoot, "..", "..");
const generated = join(landingRoot, ".generated", "adl.json");

describe("the ADL the page reads", () => {
  const adl = loadAdl(generated);
  const file = readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8").split("\n");

  it("is the file as it is now, line for line: the page is never drawn from a stale copy", () => {
    expect(adl.source).toBe("architecture/adl/structure.adl");
    expect(adl.lines.map((line) => line.raw)).toEqual(file.slice(0, adl.lines.length));
    expect(adl.lines.map((line) => line.number)).toEqual(adl.lines.map((_, index) => index + 1));
  });

  it("has the book's header, the DEFINEs and one group per # heading, each rule under its own", () => {
    expect(adl.description).toBe(file[0]!.replace("DESCRIPTION ", ""));
    expect(adl.category).toBe("Structural");
    expect(adl.entries.map((entry) => entry.name)).toEqual(["Bullpen", "Landing", "Trading App", "UI", "Contracts"]);
    expect(adl.groups.map((group) => group.heading)).toEqual([
      "Structural assertions",
      "Allowed dependencies",
      "Disallowed dependencies (direct and transitive)",
      "Entry points and secrets",
      "Model currency",
    ]);
    for (const group of adl.groups) expect(adl.lines[group.line - 1]!.raw).toBe(`# ${group.heading}`);
    for (const rule of adl.rules) expect(adl.lines[rule.line - 1]!.raw).toBe(`ASSERT(${rule.text})`);
  });

  it("gives a group's lines as the heading and then its ASSERTs, as written", () => {
    const allowed = adl.groups.find((group) => group.heading === "Allowed dependencies")!;
    expect(groupLines(adl, allowed).map((line) => line.raw)).toEqual([
      "# Allowed dependencies",
      "ASSERT(Landing IS DEPENDENT ON UI, Contracts)",
      "ASSERT(Trading App IS DEPENDENT ON UI, Contracts)",
    ]);
  });
});

describe("parseAdlJson", () => {
  const good = readFileSync(generated, "utf8");
  const mutate = (change: (data: Record<string, unknown>) => void): string => {
    const data = JSON.parse(good) as Record<string, unknown>;
    change(data);
    return JSON.stringify(data);
  };

  it("accepts what adl:emit wrote", () => {
    expect(parseAdlJson(good, "adl.json").rules.length).toBeGreaterThan(0);
  });

  it("refuses anything else, saying how to regenerate it", () => {
    expect(() => parseAdlJson("nope", "adl.json")).toThrow(/invalid JSON/);
    expect(() => parseAdlJson("[]", "adl.json")).toThrow(/Run `pnpm --filter @bullpen\/fitness-checks run adl:emit`/);
    expect(() => parseAdlJson(mutate((data) => (data.schema = 2)), "adl.json")).toThrow(/unknown schema 2/);
    expect(() => parseAdlJson(mutate((data) => (data.rules = [])), "adl.json")).toThrow(/missing rules/);
    expect(() => parseAdlJson(mutate((data) => delete data.description), "adl.json")).toThrow(/missing description/);
  });

  it("refuses a line whose tokens do not join back to it, or whose token kind is unknown", () => {
    const drift = mutate((data) => {
      const lines = data.lines as Array<{ raw: string }>;
      lines[0]!.raw = `${lines[0]!.raw} changed`;
    });
    expect(() => parseAdlJson(drift, "adl.json")).toThrow(/tokens do not join back/);
    const unknown = mutate((data) => {
      const lines = data.lines as Array<{ tokens: Array<{ kind: string }> }>;
      lines[0]!.tokens[0]!.kind = "mystery";
    });
    expect(() => parseAdlJson(unknown, "adl.json")).toThrow(/tokens do not join back/);
  });

  it("says where the file should be when it is missing", () => {
    expect(() => loadAdl(join(landingRoot, ".generated", "missing.json"))).toThrow(/adl:emit/);
  });
});
