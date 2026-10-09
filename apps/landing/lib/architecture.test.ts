import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadArchitectureParts, parseArchitecturePart } from "./architecture.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const architectureDir = join(repoRoot, "content", "architecture");
const calmDir = join(repoRoot, "architecture", "calm");
const plannedDir = join(calmDir, "planned");

describe("parseArchitecturePart / loadArchitectureParts", () => {
  it("parses all six real content/architecture/part-0N.json files", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    expect(parts).toHaveLength(6);
    expect(parts.map((p) => p.part)).toEqual([1, 2, 3, 4, 5, 6]);
    // Parts 1 and 2 are built; 3 to 6 are predictions.
    expect(parts.slice(0, 2).map((p) => p.status)).toEqual(["built", "built"]);
    for (const part of parts.slice(2)) {
      expect(part.status).toBe("planned");
    }
    for (const part of parts) {
      expect(part.nodes.length).toBeGreaterThan(0);
      expect(part.request.steps.length).toBeGreaterThan(0);
    }
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseArchitecturePart("{ not json", "test.json")).toThrow(/invalid JSON/);
  });

  it("throws when an edge references an unknown node id", () => {
    const malformed = JSON.stringify({
      part: 1,
      status: "built",
      summary: "S",
      nodes: [{ id: "a", label: "A", kind: "app", meta: "M", purpose: "P", x: 0, y: 0 }],
      edges: [{ id: "a-to-b", a: "a", b: "b", type: "sync" }],
      groups: [],
      request: { name: "R", steps: [{ edge: "a-to-b", caption: "C", detail: "D" }] },
    });
    expect(() => parseArchitecturePart(malformed, "test.json")).toThrow(/references a node id not present/);
  });

  it("throws when a request step references an unknown edge id", () => {
    const malformed = JSON.stringify({
      part: 1,
      status: "built",
      summary: "S",
      nodes: [
        { id: "a", label: "A", kind: "app", meta: "M", purpose: "P", x: 0, y: 0 },
        { id: "b", label: "B", kind: "service", meta: "M", purpose: "P", x: 0, y: 100 },
      ],
      edges: [{ id: "a-to-b", a: "a", b: "b", type: "sync" }],
      groups: [],
      request: { name: "R", steps: [{ edge: "does-not-exist", caption: "C", detail: "D" }] },
    });
    expect(() => parseArchitecturePart(malformed, "test.json")).toThrow(
      /request step 0 references an edge id not present/,
    );
  });

  it("derives ownership groups from db-owning services and their connected data nodes", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    const part1 = parts.find((p) => p.part === 1)!;
    expect(part1.groups).toEqual([]);

    const part3 = parts.find((p) => p.part === 3)!;
    expect(part3.groups).toEqual(
      expect.arrayContaining([
        { id: "prices-service-owns", label: "Prices Service", nodeIds: ["prices-service", "prices-db"] },
        { id: "market-history-service-owns", label: "Market History Service", nodeIds: ["market-history-service", "market-history-db"] },
      ]),
    );

    // Ledger Service is marked db: true from Part 4 on, but this diagram
    // never wires it to a separate data-kind node -- it stays ungrouped
    // rather than being padded into a group with nothing real in it.
    const part4 = parts.find((p) => p.part === 4)!;
    expect(part4.groups.some((g) => g.label === "Ledger Service")).toBe(false);
  });

  it("throws on an invalid node kind", () => {
    const malformed = JSON.stringify({
      part: 1,
      status: "built",
      summary: "S",
      nodes: [{ id: "a", label: "A", kind: "spaceship", meta: "M", purpose: "P", x: 0, y: 0 }],
      edges: [],
      groups: [],
      request: { name: "R", steps: [] },
    });
    expect(() => parseArchitecturePart(malformed, "test.json")).toThrow(/invalid "kind"/);
  });

  it("carries the built analytics nodes and edges into every planned part (3 to 6), and nothing else", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    for (const built of parts.slice(0, 2)) expect(built.nodes.some((n) => n.carried)).toBe(false);
    for (const part of parts.slice(2)) {
      expect(part.nodes.filter((n) => n.carried).map((n) => n.id).sort()).toEqual(["google-analytics", "microsoft-clarity"]);
      expect(part.edges.filter((e) => e.carried).map((e) => e.id).sort()).toEqual([
        "landing-to-google-analytics",
        "landing-to-microsoft-clarity",
        "trading-app-to-google-analytics",
        "trading-app-to-microsoft-clarity",
      ]);
      // Copied from Part 2, the latest built moment, but first built in Part 1 (ADR-0010, ADR-0011).
      for (const item of [...part.nodes, ...part.edges].filter((i) => i.carried)) {
        expect(item.builtIn).toBe("part-01");
      }
    }
  });

  it("leaves a predicted replacement alone: the Part 1 price snapshot service is not carried past Part 2", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    for (const part of parts.filter((p) => p.part >= 3)) {
      expect(part.nodes.some((n) => n.id === "price-snapshot-service")).toBe(false);
    }
  });

  it("keeps the carried copy of a node equal to what the latest built moment, Part 2, has, labelled as first built in Part 1", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    const built = parts[1]!.nodes.find((n) => n.id === "google-analytics")!;
    const carried = parts[3]!.nodes.find((n) => n.id === "google-analytics")!;
    expect({ ...carried, x: 0, y: 0 }).toEqual({ ...built, x: 0, y: 0, carried: true, builtIn: "part-01" });
  });

  describe("what each built part changed, derived from its moment and the previous built one", () => {
    it("gives Part 2 the controls it added to existing nodes and connections, and ADR-0009, and nothing else", () => {
      const part2 = loadArchitectureParts(architectureDir, plannedDir, calmDir)[1]!;
      expect(part2.changes?.map((c) => (c.kind === "adr" ? c.adr : `${c.target}: ${c.controls.map((k) => k.key).join(", ")}`))).toEqual([
        "Bullpen Landing: app-boundaries, explorer-matches-model",
        "Bullpen Trading App: app-boundaries",
        "Price Snapshot Service: secret-containment",
        "Price Snapshot Service → CoinGecko: call-budget, secret-containment",
        "ADR-0009",
      ]);
    });

    it("uses each control's own description from the CALM model, never one written in the loader", () => {
      const part2 = loadArchitectureParts(architectureDir, plannedDir, calmDir)[1]!;
      const model = JSON.parse(readFileSync(join(calmDir, "moments", "part-02.architecture.json"), "utf8")) as {
        nodes: Array<{ "unique-id": string; controls?: Record<string, { description?: string }> }>;
      };
      const landing = part2.changes!.find((c) => c.kind === "controls" && c.target === "Bullpen Landing");
      expect(landing).toBeDefined();
      for (const control of landing!.kind === "controls" ? landing!.controls : []) {
        expect(control.description).toBe(model.nodes.find((n) => n["unique-id"] === "landing-app")!.controls![control.key]!.description);
      }
    });

    it("does not list the analytics controls, which Part 1 already had", () => {
      const part2 = loadArchitectureParts(architectureDir, plannedDir, calmDir)[1]!;
      expect(JSON.stringify(part2.changes)).not.toContain("analytics-consent");
    });

    it("gives Part 1 and every planned part no changes, and nothing at all without the calm directory", () => {
      const withCalm = loadArchitectureParts(architectureDir, plannedDir, calmDir);
      for (const part of withCalm.filter((p) => p.part !== 2)) expect(part.changes).toBeUndefined();
      for (const part of loadArchitectureParts(architectureDir, plannedDir)) expect(part.changes).toBeUndefined();
    });
  });
});
