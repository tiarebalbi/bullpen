import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET_RULE, checkBudget, checkBudgetAt, readConfiguredRevalidateSeconds, type AllowanceEntry } from "./budget-check.js";
import { expectFailureFormat, fixturesRoot } from "./test-helpers.js";

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
    expect(checkBudget(300, ALLOWANCES)).toEqual([]);
  });

  it("fails at 60s (43,200 modeled monthly calls, far over budget)", () => {
    const [violation] = checkBudget(60, ALLOWANCES);
    expect(violation!.why).toContain("43200");
    expect(violation!.why).toContain("60s");
    expect(violation!.where).toBe("apps/web/app/api/price/[symbol]/route.ts");
  });

  it("fails clearly when the allowance entry is missing", () => {
    const [violation] = checkBudget(300, []);
    expect(violation!.where).toBe("cost/allowances.json");
    expect(violation!.why).toContain("coingecko-demo");
  });

  it("fails in the shared format, citing ADR-0005", () => {
    const text = expectFailureFormat(checkBudget(60, ALLOWANCES)[0]!, "budget");
    expect(text).toContain(`✗ budget: ${BUDGET_RULE}`);
    expect(text).toContain("(ADR-0005)");
    expectFailureFormat(checkBudget(300, [])[0]!, "budget");
  });
});

describe("checkBudgetAt", () => {
  it("turns an unreadable route into a violation instead of a crash", () => {
    const [violation] = checkBudgetAt(join(fixturesRoot, "does-not-exist"), ALLOWANCES);
    expectFailureFormat(violation!, "budget");
    expect(violation!.fix).toContain("REVALIDATE_SECONDS");
  });

  it("runs the whole check against a fixture repo", () => {
    expect(checkBudgetAt(join(fixturesRoot, "budget-ok"), ALLOWANCES)).toEqual([]);
    expect(checkBudgetAt(join(fixturesRoot, "budget-violation"), ALLOWANCES)).toHaveLength(1);
  });
});
