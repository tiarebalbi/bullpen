import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllowances, parseUsage } from "./cost.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("parseAllowances", () => {
  it("parses the real cost/allowances.json ledger", () => {
    const content = readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8");
    const allowances = parseAllowances(content);

    expect(allowances.length).toBeGreaterThan(0);
    for (const entry of allowances) {
      expect(entry.source_url).toMatch(/^https:\/\//);
      expect(typeof entry.allowance).toBe("number");
    }
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseAllowances("not json")).toThrow(/invalid JSON/);
  });

  it("throws a clear error on schema-invalid data", () => {
    const malformed = JSON.stringify([{ service: "x" }]);
    expect(() => parseAllowances(malformed)).toThrow(/failed schema validation/);
  });
});

describe("parseUsage", () => {
  it("parses the real pending cost/usage/2026-w40.json snapshot", () => {
    const content = readFileSync(join(repoRoot, "cost", "usage", "2026-w40.json"), "utf8");
    const usage = parseUsage(content);

    expect(usage.status).toBe("pending");
    expect(usage.usage.length).toBeGreaterThan(0);
    expect(usage.usage.every((entry) => entry.value === null)).toBe(true);
  });

  it("throws a clear error when a pending snapshot has a numeric value", () => {
    const malformed = JSON.stringify({
      week: "2026-w41",
      period: { start: "2026-10-05", end: "2026-10-11" },
      status: "pending",
      usage: [{ service: "vercel-hobby", metric: "active_cpu_time", value: 1, unit: "hours" }],
    });
    expect(() => parseUsage(malformed)).toThrow(/failed schema validation/);
  });

  it("throws a clear error on structurally invalid data", () => {
    const malformed = JSON.stringify({ week: "not-a-week", status: "unknown" });
    expect(() => parseUsage(malformed)).toThrow(/failed schema validation/);
  });
});
