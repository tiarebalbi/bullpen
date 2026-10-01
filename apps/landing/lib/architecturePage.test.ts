import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdl } from "./adl.js";
import { loadArchitectureParts } from "./architecture.js";
import { buildArchitecturePage, CHECK_NAME_BY_FILE, type ArchitecturePageData } from "./architecturePage.js";
import { loadCalmDocs } from "./calm.js";
import { readPriceCacheSeconds } from "./priceCache.js";
import type { RulesSnapshot } from "./rulesSnapshot.js";
import { loadSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adl = parseAdl(readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8"));

const snapshot = (passing: boolean): RulesSnapshot => ({
  schema: 1,
  part: 2,
  generatedAt: "2026-10-01T12:00:00.000Z",
  commit: "0".repeat(40),
  dirty: false,
  ref: "test",
  source: "local",
  passed: passing,
  checks: [
    {
      id: "check-arch",
      name: "check:arch",
      command: "pnpm check:arch",
      passed: passing,
      summary: "",
      raw: "check-arch.txt",
      rules: Object.values(CHECK_NAME_BY_FILE).map((check) => ({ rule: `rule of ${check}`, check, passed: passing })),
    },
  ],
});

function build(withSnapshot: RulesSnapshot | null): ArchitecturePageData {
  return buildArchitecturePage({
    parts: loadArchitectureParts(join(repoRoot, "content", "architecture")),
    series: loadSeries(join(repoRoot, "content", "series.json")),
    calm: loadCalmDocs(repoRoot),
    adlRules: adl.rules,
    snapshot: withSnapshot,
    cacheSeconds: readPriceCacheSeconds(repoRoot),
  });
}

describe("buildArchitecturePage, from the real repo", () => {
  const page = build(snapshot(true));

  it("labels the scrubber with the series' real titles and each part's status from its explorer content", () => {
    expect(page.scrubber).toHaveLength(6);
    expect(page.scrubber[1]).toEqual({ part: 2, title: "Architecture as code", status: "built" });
    expect(page.scrubber[2]!.status).toBe("planned");
  });

  describe("services", () => {
    it("lists only what exists at Parts 1 and 2: the landing, the trading app and the price route", () => {
      for (const part of [1, 2]) {
        expect(page.services[part]!.built.map((s) => s.name)).toEqual(["Bullpen Landing", "Bullpen Trading App", "Price Snapshot Service"]);
        expect(page.services[part]!.planned).toEqual([]);
      }
    });

    it("says what each one runs on, runs from and owns, from the moment and the ADL", () => {
      const [landing, , route] = page.services[2]!.built;
      expect(landing).toMatchObject({ kind: "app", runtime: "Static", path: "apps/landing" });
      expect(landing!.owns).toEqual(["The code in apps/landing", "Ships packages/ui and packages/contracts"]);
      expect(route).toMatchObject({ kind: "service", runtime: "Serverless", path: "apps/web/app/api/price" });
      // The secret's name comes from the ADL rule, so this file never has to spell it.
      const secret = /^ONLY \S+ READS (\S+)$/.exec(adl.rules.find((rule) => rule.includes(" READS "))!)![1];
      expect(route!.owns).toContain(`The only code that reads ${secret}`);
      expect(route!.adrs).toEqual(["ADR-0002", "ADR-0005"]);
    });

    it("lists the interfaces the CALM moment declares, in and out", () => {
      const route = page.services[2]!.built[2]!;
      expect(route.interfaces).toEqual([
        { direction: "in", peer: "Bullpen Trading App", how: "HTTPS, synchronous", mode: "sync" },
        { direction: "out", peer: "CoinGecko", how: "HTTPS, synchronous", mode: "sync" },
      ]);
    });

    it("shows a service's rules with the snapshot's result: none at Part 1, where nothing is enforced yet", () => {
      expect(page.services[1]!.built.every((s) => s.rules.length === 0)).toBe(true);
      const [landing, trading, route] = page.services[2]!.built;
      expect(landing!.rules.map((r) => r.check)).toEqual(["turbo boundaries", "entry-point imports", "explorer consistency"]);
      expect(trading!.rules.map((r) => r.check)).toEqual(["turbo boundaries", "entry-point imports"]);
      expect(route!.rules.map((r) => r.check)).toEqual(["secret containment", "budget"]);
      expect(page.services[2]!.built.flatMap((s) => s.rules).every((r) => r.passed === true)).toBe(true);
    });

    it("reports a failing check as failing, and claims nothing without a snapshot", () => {
      expect(build(snapshot(false)).services[2]!.built.flatMap((s) => s.rules).every((r) => r.passed === false)).toBe(true);
      expect(build(null).services[2]!.built.flatMap((s) => s.rules).every((r) => r.passed === null)).toBe(true);
    });

    it("adds the planned services for a planned part, with the part they arrive in", () => {
      const planned = page.services[3]!.planned;
      expect(planned.map((s) => [s.name, s.arrives])).toEqual([
        ["Prices Service", 3],
        ["Market History Service", 3],
      ]);
      expect(page.services[5]!.planned.map((s) => s.name)).toContain("Orders Service");
      expect(page.services[3]!.built).toHaveLength(3);
    });

    it("every control that names a check names one the snapshot can report on", () => {
      for (const doc of loadCalmDocs(repoRoot).values()) {
        const enforced = [...doc.nodes.flatMap((n) => n.controls), ...doc.relationships.flatMap((r) => r.controls)].flatMap((c) => c.requirements).map((r) => r.enforcedBy).filter((f): f is string => Boolean(f));
        for (const file of enforced) expect(CHECK_NAME_BY_FILE[file], `${file} has no check name`).toBeDefined();
      }
    });
  });

  describe("flows", () => {
    it("is one real flow at Parts 1 and 2: the player opens the app, which asks the route, which asks CoinGecko", () => {
      for (const part of [1, 2]) {
        const flow = page.flows[part]!;
        expect(flow.name).toBe("a price request");
        expect(flow.planned).toBe(false);
        expect(flow.lanes.map((l) => l.label)).toEqual(["Player", "Bullpen Trading App", "Price Snapshot Service", "CoinGecko"]);
        expect(flow.steps.map((s) => `${s.from}>${s.to}`)).toEqual([
          "player>trading-app",
          "trading-app>price-snapshot-service",
          "price-snapshot-service>market-data-provider",
          "market-data-provider>price-snapshot-service",
        ]);
        expect(flow.steps.map((s) => s.n)).toEqual([1, 2, 3, 4]);
      }
    });

    it("says the answer is cached for the route's own interval, on the fetch step of both built parts", () => {
      expect(readPriceCacheSeconds(repoRoot)).toBe(300);
      for (const part of [1, 2]) {
        const fetch = page.flows[part]!.steps[2]!;
        expect(fetch.caption).toBe("Fetch upstream");
        expect(fetch.detail).toContain("Cached for 300 seconds.");
        expect(page.flows[part]!.steps[1]!.detail).not.toContain("Cached");
      }
    });

    it("makes no cache claim for a planned part, and none at all if the route cannot be read", () => {
      expect(page.flows[3]!.steps.every((s) => !/cached/i.test(s.detail))).toBe(true);
      const unread = buildArchitecturePage({
        parts: loadArchitectureParts(join(repoRoot, "content", "architecture")),
        series: loadSeries(join(repoRoot, "content", "series.json")),
        calm: loadCalmDocs(repoRoot),
        adlRules: adl.rules,
        snapshot: null,
        cacheSeconds: null,
      });
      expect(unread.flows[2]!.steps.every((s) => !/cached/i.test(s.detail))).toBe(true);
    });

    it("marks a predicted flow as planned", () => {
      expect(page.flows[3]!.planned).toBe(true);
    });
  });

  describe("data", () => {
    it("has nothing to show before Part 3: there is no database at Parts 1 and 2", () => {
      expect(page.data[1]).toEqual({ reached: false, planned: false, databases: [] });
      expect(page.data[2]!.reached).toBe(false);
    });

    it("shows each planned database with the service that owns it from Part 3", () => {
      expect(page.data[3]).toMatchObject({ reached: true, planned: true });
      expect(page.data[3]!.databases.map((d) => [d.label, d.ownerLabel])).toEqual([
        ["Prices Database", "Prices Service"],
        ["Market History Database", "Market History Service"],
      ]);
    });
  });
});
