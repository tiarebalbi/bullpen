import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAllowances, validateUsage } from "./cost.js";

// Read via fs, not a static import, so this package's module graph doesn't
// reach into the repo-root `cost/` directory (that would trip `turbo
// boundaries`'s "no imports outside your own package" rule).
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const allowances = JSON.parse(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf-8"));
const usageWeek40 = JSON.parse(
  readFileSync(join(repoRoot, "cost", "usage", "2026-w40.json"), "utf-8"),
);

describe("validateAllowances", () => {
  it("accepts the real cost/allowances.json ledger", () => {
    const result = validateAllowances(allowances);
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it("rejects a malformed allowance entry with a clear error", () => {
    const malformed = [
      {
        service: "vercel-hobby",
        // missing "metric"
        allowance: "a lot", // wrong type: should be a number
        unit: "hours/month",
        source_url: "not-a-url", // missing https:// prefix
        checked_on: "yesterday", // wrong format
      },
    ];

    const result = validateAllowances(malformed);

    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
    expect(result.errors).toContain("metric");
    expect(result.errors).toMatch(/must be number/);
  });
});

describe("validateUsage", () => {
  it("accepts the real cost/usage/2026-w40.json pending snapshot", () => {
    const result = validateUsage(usageWeek40);
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it("rejects a usage snapshot with a numeric value while status is pending", () => {
    const malformed = {
      week: "2026-w40",
      period: { start: "2026-09-28", end: "2026-10-04" },
      status: "pending",
      usage: [
        { service: "vercel-hobby", metric: "active_cpu_time", value: 1.5, unit: "hours" },
      ],
    };

    const result = validateUsage(malformed);

    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
    expect(result.errors).toMatch(/must be null/);
  });

  it("rejects a malformed usage snapshot missing required fields", () => {
    const malformed = {
      week: "not-a-week",
      status: "unknown-status",
    };

    const result = validateUsage(malformed);

    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
  });
});
