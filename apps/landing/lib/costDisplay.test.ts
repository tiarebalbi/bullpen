import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllowances, parseUsage } from "./cost.js";
import {
  PART_1_SERVICES,
  groupLaterServices,
  humanAllowance,
  humanUnit,
  metricLabel,
  pendingUsageNote,
  serviceLabel,
} from "./costDisplay.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const allowances = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));
const usage = parseUsage(readFileSync(join(repoRoot, "cost", "usage", "2026-w40.json"), "utf8"));

describe("serviceLabel / metricLabel", () => {
  it("gives every real allowance's service and metric a human label", () => {
    for (const entry of allowances) {
      expect(() => serviceLabel(entry.service)).not.toThrow();
      expect(() => metricLabel(entry.metric)).not.toThrow();
    }
  });

  it("throws on an unknown service or metric rather than falling back to the raw id", () => {
    expect(() => serviceLabel("some-new-service")).toThrow(/no human label for service/);
    expect(() => metricLabel("some_new_metric")).toThrow(/no human label for metric/);
  });
});

describe("humanUnit / humanAllowance", () => {
  it("turns a slash-period unit into a spoken one", () => {
    expect(humanUnit("hours/month")).toBe("hours a month");
    expect(humanUnit("calls/min")).toBe("calls a minute");
    expect(humanUnit("deployments/day")).toBe("deployments a day");
  });

  it("leaves units with no recognized period suffix unchanged", () => {
    expect(humanUnit("GB per function (1 vCPU)")).toBe("GB per function (1 vCPU)");
  });

  it("formats a real allowance as a human-readable string", () => {
    const entry = allowances.find((a) => a.service === "vercel-hobby" && a.metric === "function_invocations")!;
    expect(humanAllowance(entry)).toBe("1,000,000 invocations a month");
  });
});

describe("groupLaterServices", () => {
  it("groups every non-Part-1 service exactly once, with a real sourced part where one exists", () => {
    const grouped = groupLaterServices(allowances);
    const services = grouped.map((g) => g.service);
    expect(new Set(services).size).toBe(services.length); // no duplicates
    for (const service of services) expect(PART_1_SERVICES.has(service)).toBe(false);

    const neon = grouped.find((g) => g.service === "neon")!;
    expect(neon.arrivesInPart).toBe(3);
    const upstash = grouped.find((g) => g.service === "upstash-redis")!;
    expect(upstash.arrivesInPart).toBeUndefined();
  });
});

describe("pendingUsageNote", () => {
  it("builds the reader sentence from the real snapshot's own week and period end, never a hardcoded date", () => {
    const note = pendingUsageNote(usage);
    expect(note).toContain("Week 40");
    expect(note).toContain("October 4");
    expect(note).toContain("pending");
  });

  it("returns null once a snapshot is no longer pending", () => {
    expect(pendingUsageNote({ ...usage, status: "measured" })).toBeNull();
  });
});
