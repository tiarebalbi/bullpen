import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllowances } from "./cost.js";

// The sweeper's Hobby quota is stated in two places: the cost note on its node in every content/architecture/*.json, and the daemon entry in cost/allowances.json.
// They were found to disagree (10 against nothing, then 5 against 10), so this holds them equal. ADR-0032 is the record.

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));
const daemon = allowances.find((a) => a.service === "vercel-daemons" && a.metric === "active_cpu_time");

const contentDir = join(repoRoot, "content", "architecture");
const files = [...readdirSync(contentDir).filter((f) => f.endsWith(".json")).map((f) => join(contentDir, f)), ...readdirSync(join(contentDir, "staged")).filter((f) => f.endsWith(".json")).map((f) => join(contentDir, "staged", f))];

/** Every "Hobby quota: N Active CPU-hours" cost note, with the file it is in. */
function quotaNotes(): Array<{ file: string; hours: number }> {
  const notes: Array<{ file: string; hours: number }> = [];
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/"costNote":\s*"Hobby quota: (\d+) Active CPU-hours"/g)) notes.push({ file: file.slice(repoRoot.length + 1), hours: Number(m[1]) });
  }
  return notes;
}

describe("the sweeper's Hobby daemon quota", () => {
  it("has one entry in the cost ledger, from Vercel's daemon limits page, checked and dated", () => {
    expect(daemon).toBeDefined();
    expect(daemon!.allowance).toBe(5);
    expect(daemon!.unit).toBe("hours/month");
    expect(daemon!.source_url).toBe("https://vercel.com/docs/daemons/limits");
    expect(daemon!.checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is the same number in every sweeper cost note as in the ledger", () => {
    const notes = quotaNotes();
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) expect(note.hours, `${note.file} says ${note.hours}`).toBe(daemon!.allowance);
  });

  it("is stated by the notes of Part 4, the bonus and the built Part 5, which all show the sweeper", () => {
    expect(quotaNotes().map((n) => n.file).sort()).toEqual(["content/architecture/bonus-handles.json", "content/architecture/part-04.json", "content/architecture/staged/part-05.json"]);
  });

  it("is told apart from the other Hobby allowances: Active CPU for functions stays 4 hours", () => {
    expect(allowances.find((a) => a.service === "vercel-hobby" && a.metric === "active_cpu_time")!.allowance).toBe(4);
  });
});
