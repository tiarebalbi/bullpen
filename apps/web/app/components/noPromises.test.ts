import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The screens promise nothing about a later part of the series: a date belongs to the blog, and a screen that says "arrives in Part N" is wrong the day the plan moves.
const dir = import.meta.dirname;
const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

/** The file's code with its comments removed: a doc comment may name a part, the words on screen may not. */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the trading screens' words", () => {
  it("name no later part of the series", () => {
    const offenders = sources.filter((f) => /\bPart \d\b/.test(withoutComments(readFileSync(join(dir, f), "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("say what the chart lacks, without a promise", () => {
    expect(readFileSync(join(dir, "SymbolDetail.tsx"), "utf8")).toContain("A chart needs price history, which Bullpen doesn’t store yet.");
  });
});
