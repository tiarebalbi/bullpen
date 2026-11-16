import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

// An accepted ADR is not edited, but it may carry one extra status line, "Amended by ADR-NNNN", pointing at the ADR that corrects it (the landing reads only the status line's first line).
// This holds the pointer honest: the amending ADR has to exist, be Accepted, and name the ADR it amends.

const STATUS_AMENDMENT = /^Amended by ADR-(\d{4})$/;

/** The first line of "## Status" is the status; any later line clarifies it. */
function statusLines(markdown: string): string[] {
  const status = /^## Status\n\n([\s\S]*?)\n\n## /m.exec(markdown)?.[1] ?? "";
  return status.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Problems with amendments across a set of ADRs, keyed by their four-digit number. Empty when every "Amended by" line leads to an Accepted ADR that names the amended one. */
export function amendmentProblems(adrs: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [id, markdown] of Object.entries(adrs)) {
    for (const line of statusLines(markdown).slice(1)) {
      const amendedBy = STATUS_AMENDMENT.exec(line)?.[1];
      if (!amendedBy) continue;
      const amender = adrs[amendedBy];
      if (amender === undefined) problems.push(`ADR-${id} says "${line}" but ADR-${amendedBy} does not exist`);
      else if (statusLines(amender)[0] !== "Accepted") problems.push(`ADR-${id} says "${line}" but ADR-${amendedBy} is not Accepted`);
      else if (!amender.includes(`ADR-${id}`)) problems.push(`ADR-${id} says "${line}" but ADR-${amendedBy} never names ADR-${id}`);
    }
  }
  return problems;
}

const adr = (status: string, body = ""): string => `# ADR-0000: x\n\n## Status\n\n${status}\n\n## Date\n\n2026-11-16\n\n${body}`;

describe("amended ADRs link their amendment", () => {
  it("passes for an Accepted amender that names the ADR it amends", () => {
    expect(amendmentProblems({ "0001": adr("Accepted\nAmended by ADR-0002"), "0002": adr("Accepted", "This corrects ADR-0001.") })).toEqual([]);
  });

  it("fails when the amending ADR does not exist", () => {
    expect(amendmentProblems({ "0001": adr("Accepted\nAmended by ADR-0002") })).toEqual(['ADR-0001 says "Amended by ADR-0002" but ADR-0002 does not exist']);
  });

  it("fails when the amending ADR is not Accepted", () => {
    expect(amendmentProblems({ "0001": adr("Accepted\nAmended by ADR-0002"), "0002": adr("Proposed", "Corrects ADR-0001.") })).toEqual(['ADR-0001 says "Amended by ADR-0002" but ADR-0002 is not Accepted']);
  });

  it("fails when the amending ADR never names the ADR it amends", () => {
    expect(amendmentProblems({ "0001": adr("Accepted\nAmended by ADR-0002"), "0002": adr("Accepted", "Unrelated.") })).toEqual(['ADR-0001 says "Amended by ADR-0002" but ADR-0002 never names ADR-0001']);
  });

  it("ignores a status with no amendment line", () => {
    expect(amendmentProblems({ "0001": adr("Accepted") })).toEqual([]);
  });

  it("holds for every ADR in the repo, and ADR-0018 is amended by ADR-0032", () => {
    const dir = join(realRepoRoot, "architecture", "adr");
    const adrs: Record<string, string> = {};
    for (const file of readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f))) adrs[file.slice(0, 4)] = readFileSync(join(dir, file), "utf8");
    expect(amendmentProblems(adrs)).toEqual([]);
    expect(statusLines(adrs["0018"]!)).toEqual(["Accepted", "Amended by ADR-0032"]);
    expect(adrs["0032"]).toContain("ADR-0018");
  });
});
