import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

const read = (relative: string): string => readFileSync(join(realRepoRoot, relative), "utf8");

// A path in backticks, like `docs/data-sources.md`.
const BACKTICKED = new RegExp("`([^`]+)`", "g");

describe("CLAUDE.md", () => {
  const text = read("CLAUDE.md");

  it("stays under 80 lines, so an agent reads all of it", () => {
    expect(text.split("\n").length).toBeLessThan(80);
  });

  it("covers the git policy and why, how to read a check failure, that the model can be stale, and where each record lives", () => {
    expect(text).toContain("## Git policy");
    expect(text).toMatch(/Why: in week 1/);
    expect(text).toContain("## Reading a check failure");
    expect(text).toContain("✗ <check>:");
    expect(text).toContain("## The CALM model can be stale");
    expect(text).toContain("ADRs and `docs/data-sources.md` win over a planned moment");
    expect(text).toContain("## Where each record lives");
  });

  it("names only records that exist (part-specific ones by their pattern)", () => {
    const section = text.slice(text.indexOf("## Where each record lives"), text.indexOf("Read the current part's ADRs"));
    const paths = [...section.matchAll(BACKTICKED)].map((match) => match[1]!).filter((path) => path.includes("/") && !path.includes("0N"));
    expect(paths.length).toBeGreaterThan(5);
    const missing = paths.filter((path) => !existsSync(join(realRepoRoot, path)));
    expect(missing, `CLAUDE.md names paths that do not exist`).toEqual([]);
  });

  it("does not contain an email address", () => {
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});

describe("the recorded decisions", () => {
  it("ADR-0002 keeps reason 5 as written and adds only the one sentence", () => {
    const adr = read("architecture/adr/0002-why-distribute-at-all.md");
    const original = "5. **Shared budgets** — cost allocation across teams or features that a single deployable can't express.";
    const added = "With one person on the project, this also covers a limit every instance draws from and only one owner can manage, such as an upstream API call budget.";
    expect(adr).toContain(`${original} ${added}\n`);
    expect(adr).toContain("4. **Runtime fit**");
  });

  it("ADR-0009 is Proposed, belongs to Part 2, and records all the incidents with UTC times", () => {
    const adr = read("architecture/adr/0009-guardrails-enforced-not-requested.md");
    expect(adr).toMatch(/## Status\n\nProposed\n/);
    expect(adr).toMatch(/## Part\n\n2\n/);
    for (const fact of ["PR #10", "#12", "44a27ec", "e6c0f77", "2a957ad", "e7e7e8f", "#14", "#15", "UTC"]) expect(adr).toContain(fact);
  });
});
