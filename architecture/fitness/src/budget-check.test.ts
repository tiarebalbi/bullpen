import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBudget, readConfiguredRevalidateSeconds, type AllowanceEntry } from "./budget-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, "__fixtures__");

const ALLOWANCES: AllowanceEntry[] = [
  { service: "coingecko-demo", metric: "monthly_calls", allowance: 10_000, unit: "calls/month" },
  { service: "coingecko-demo", metric: "rate_limit", allowance: 100, unit: "calls/min" },
];

describe("readConfiguredRevalidateSeconds", () => {
  it("reads the real configured interval from a fixture route file", () => {
    expect(readConfiguredRevalidateSeconds(join(fixturesRoot, "budget-ok"))).toBe(300);
    expect(readConfiguredRevalidateSeconds(join(fixturesRoot, "budget-violation"))).toBe(60);
  });

  it("throws when the route file doesn't exist", () => {
    expect(() => readConfiguredRevalidateSeconds(join(fixturesRoot, "does-not-exist"))).toThrow(/not found/);
  });
});

describe("checkBudget", () => {
  it("passes at 300s (8,640 modeled monthly calls, within 90% of 10,000)", () => {
    const violations = checkBudget(300, ALLOWANCES);
    expect(violations).toEqual([]);
  });

  it("fails at 60s (43,200 modeled monthly calls, far over budget)", () => {
    const violations = checkBudget(60, ALLOWANCES);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("43200");
    expect(violations[0]).toContain("60s");
  });

  it("fails clearly when the allowance entry is missing", () => {
    const violations = checkBudget(300, []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("coingecko-demo");
  });
});
