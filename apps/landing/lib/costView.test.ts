import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLatestUsage, parseAllowances, type UsageSnapshot } from "./cost.js";
import { OFF_LANDING_SERVICES, PER_PLAYER_ESTIMATE_PART, buildCostView, buildUsageView, landingAllowances, spendView } from "./costView.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const all = parseAllowances(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8"));
const usage = loadLatestUsage(join(repoRoot, "cost", "usage"));
const BUILT_PART = 3;

describe("landingAllowances", () => {
  it("leaves Redis and Lambda off the landing and keeps every other entry, Grafana included", () => {
    const shown = landingAllowances(all);
    expect([...OFF_LANDING_SERVICES].sort()).toEqual(["aws-lambda", "upstash-redis"]);
    expect(shown.some((a) => OFF_LANDING_SERVICES.has(a.service))).toBe(false);
    expect(shown.length).toBe(all.length - all.filter((a) => OFF_LANDING_SERVICES.has(a.service)).length);
    expect(shown.some((a) => a.service === "grafana-cloud")).toBe(true);
  });
});

describe("buildCostView", () => {
  const view = buildCostView(all, usage, BUILT_PART);

  it("says it tracks as many allowances as it lists: the count is the number of rows", () => {
    expect(view.count).toBe(view.rows.length);
    expect(view.count).toBe(landingAllowances(all).length);
  });

  it("lists what runs today first, then what arrives later in order of part, with Grafana as a Part 5 entry", () => {
    const parts = view.rows.map((r) => r.arrivesInPart);
    expect(parts.slice(0, parts.indexOf(4))).toEqual(Array(parts.indexOf(4)).fill(null));
    expect([...parts.filter((p): p is number => p !== null)]).toEqual([...parts.filter((p): p is number => p !== null)].sort((a, b) => a - b));
    expect(view.rows.filter((r) => r.service === "Grafana Cloud").every((r) => r.arrivesInPart === 5)).toBe(true);
    expect(view.rows.filter((r) => r.service === "Neon").every((r) => r.arrivesInPart === null)).toBe(true);
  });

  it("gives every row a source and the date it was checked", () => {
    for (const row of view.rows) {
      expect(row.sourceUrl).toMatch(/^https:\/\//);
      expect(row.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(view.checkedOn).toBe([...view.rows].map((r) => r.checkedOn).sort().pop());
  });

  it("puts no number in the per-player slot: it says in which part it arrives", () => {
    expect(PER_PLAYER_ESTIMATE_PART).toBe(5);
    expect(view.perPlayer).toBe("Arrives in Part 5");
    expect(view.perPlayer).not.toMatch(/\$|\d+\.\d\d/);
  });

  it("says spend is pending, not zero, and whose number is missing", () => {
    expect(view.spend.label).toBe("pending");
    expect(view.spend.caption).toMatch(/Neon/);
    expect(view.spend.caption).toContain(usage.week);
    expect(view.spend.caption).not.toMatch(/\$0/);
  });

  it("the timeline's Part 5 is the one about the bill, so the slot's part is not made up", () => {
    const timeline = JSON.parse(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8")) as { moments: Array<{ "unique-id": string; name: string }> };
    expect(timeline.moments.find((m) => m["unique-id"] === `part-0${PER_PLAYER_ESTIMATE_PART}`)!.name).toMatch(/bill/i);
  });
});

describe("spendView", () => {
  it("on free tiers only, still says nothing is estimated", () => {
    const free = all.filter((a) => a.service !== "neon-launch");
    expect(spendView(free, usage).caption).toMatch(/free tier/);
  });
});

describe("buildUsageView", () => {
  const view = buildUsageView(all, usage, BUILT_PART);

  it("shows the services in use today only: no Redis, Lambda, Grafana, Queues or Workflows", () => {
    const services = new Set(view.rows.map((r) => r.service));
    for (const absent of ["Upstash Redis", "AWS Lambda", "Grafana Cloud", "Vercel Queues", "Vercel Workflows"]) expect(services.has(absent)).toBe(false);
    for (const present of ["Vercel Hobby", "Neon", "CoinGecko Demo"]) expect(services.has(present)).toBe(true);
  });

  it("says usage pending for a row with no reading, and never a bar or a number the snapshot does not hold", () => {
    for (const row of view.rows) {
      expect(row.measured).toBe(false);
      expect(row.reading).toBe("usage pending");
    }
  });

  it("shows a reading against its allowance once the snapshot has one", () => {
    const measured: UsageSnapshot = { ...usage, status: "measured", usage: usage.usage.map((u) => (u.service === "vercel-hobby" && u.metric === "function_invocations" ? { ...u, value: 812000 } : u)) };
    const row = buildUsageView(all, measured, BUILT_PART).rows.find((r) => r.metric === "Function invocations")!;
    expect(row.measured).toBe(true);
    expect(row.reading).toBe("812,000 / 1,000,000 invocations a month");
  });

  it("names the week and period of the snapshot it read", () => {
    expect(view.week).toBe(usage.week);
    expect(view.period).toBe(`${usage.period.start} – ${usage.period.end}`);
  });

  it("still throws for a usage entry with no allowance, so a missing cap cannot be hidden", () => {
    const broken: UsageSnapshot = { ...usage, usage: [...usage.usage, { service: "nothing", metric: "nothing", value: null, unit: "x" }] };
    expect(() => buildUsageView(all, broken, BUILT_PART)).toThrow(/no "nothing"/);
  });
});
