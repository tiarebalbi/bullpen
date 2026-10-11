import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkOutcome, loadLatestRulesSnapshot, parseRulesSnapshot, resultForRule, ruleOutcome, type RulesSnapshot } from "./rulesSnapshot.js";

const snapshot = (part: number, overrides: Partial<RulesSnapshot> = {}): RulesSnapshot => ({
  schema: 2,
  part,
  generatedAt: "2026-10-01T12:00:00.000Z",
  commit: "a".repeat(40),
  dirty: false,
  ref: "test",
  source: "local",
  passed: true,
  checks: [
    {
      id: "check-arch",
      name: "check:arch",
      command: "pnpm check:arch",
      passed: true,
      summary: "",
      raw: "check-arch.txt",
      rules: [
        { id: "r1", rule: "r1", check: "structure", passed: true },
        { id: "r2", rule: "r2", check: "structure", passed: false },
        { id: "r3", rule: "r3", check: "budget", passed: true },
      ],
    },
    { id: "calm-part-01", name: "calm 1", command: "x", passed: true, summary: "", raw: "c1", rules: [] },
    { id: "calm-timeline", name: "calm t", command: "x", passed: false, summary: "", raw: "c2", rules: [] },
  ],
  ...overrides,
});

function reportsWith(...parts: Array<[string, string]>): string {
  const root = mkdtempSync(join(tmpdir(), "reports-"));
  for (const [dir, content] of parts) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "summary.json"), content);
  }
  return root;
}

describe("parseRulesSnapshot", () => {
  it("reads a well-formed snapshot", () => {
    expect(parseRulesSnapshot(JSON.stringify(snapshot(2)), "x").part).toBe(2);
  });

  it("refuses anything that is not a snapshot, rather than render a pass nobody recorded", () => {
    expect(() => parseRulesSnapshot("nope", "x")).toThrow(/x: invalid JSON/);
    expect(() => parseRulesSnapshot("{}", "x")).toThrow(/unknown schema/);
    expect(() => parseRulesSnapshot(JSON.stringify({ ...snapshot(2), schema: 1 }), "x")).toThrow(/unknown schema 1/);
    expect(() => parseRulesSnapshot(JSON.stringify({ ...snapshot(2), dirty: undefined }), "x")).toThrow(/missing dirty/);
    expect(() => parseRulesSnapshot(JSON.stringify({ ...snapshot(2), checks: [] }), "x")).toThrow(/missing checks/);
  });
});

describe("loadLatestRulesSnapshot", () => {
  it("returns the highest part that has a snapshot", () => {
    const root = reportsWith(["part-01", JSON.stringify(snapshot(1))], ["part-02", JSON.stringify(snapshot(2))]);
    expect(loadLatestRulesSnapshot(root)?.part).toBe(2);
  });

  it("returns null when nothing has been snapshotted, so the page says so instead of guessing", () => {
    expect(loadLatestRulesSnapshot(join(tmpdir(), "no-such-reports-dir"))).toBeNull();
    expect(loadLatestRulesSnapshot(mkdtempSync(join(tmpdir(), "empty-")))).toBeNull();
  });

  it("ignores directories that are not parts, and throws on a part whose summary is broken", () => {
    const root = reportsWith(["part-01", JSON.stringify(snapshot(1))], ["scratch", "{}"]);
    expect(loadLatestRulesSnapshot(root)?.part).toBe(1);
    expect(() => loadLatestRulesSnapshot(reportsWith(["part-02", "{}"]))).toThrow(/part-02\/summary\.json/);
  });
});

describe("outcomes", () => {
  it("ruleOutcome: every rule of a named check must have held; nothing is claimed for a check with no rule", () => {
    expect(ruleOutcome(snapshot(2), "budget")).toBe(true);
    expect(ruleOutcome(snapshot(2), "structure")).toBe(false);
    expect(ruleOutcome(snapshot(2), "secret containment")).toBeNull();
    expect(ruleOutcome(null, "budget")).toBeNull();
  });

  it("checkOutcome: by id or id prefix, and a failing member fails the group", () => {
    expect(checkOutcome(snapshot(2), "check-arch")).toBe(true);
    expect(checkOutcome(snapshot(2), "calm-")).toBe(false);
    expect(checkOutcome(snapshot(2), "calm-part-01")).toBe(true);
    expect(checkOutcome(snapshot(2), "nothing-")).toBeNull();
    expect(checkOutcome(null, "calm-")).toBeNull();
  });
});

describe("resultForRule", () => {
  it("finds a rule's result by its id, wherever the check keeps it, and nothing for an id it does not have", () => {
    expect(resultForRule(snapshot(2), "r2")).toMatchObject({ rule: "r2", passed: false });
    expect(resultForRule(snapshot(2), "r3")).toMatchObject({ check: "budget", passed: true });
    expect(resultForRule(snapshot(2), "nope")).toBeNull();
    expect(resultForRule(null, "r1")).toBeNull();
  });
});
