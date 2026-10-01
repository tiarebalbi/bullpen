import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadArchitectureParts, parseArchitecturePart } from "./architecture.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const architectureDir = join(repoRoot, "content", "architecture");
const plannedDir = join(repoRoot, "architecture", "calm", "planned");

describe("parseArchitecturePart / loadArchitectureParts", () => {
  it("parses all six real content/architecture/part-0N.json files", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    expect(parts).toHaveLength(6);
    expect(parts.map((p) => p.part)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parts[0]!.status).toBe("built");
    for (const part of parts.slice(1)) {
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

  it("carries the built analytics nodes and edges into every planned part, and nothing else", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    expect(parts[0]!.nodes.some((n) => n.carried)).toBe(false);
    for (const part of parts.slice(1)) {
      expect(part.nodes.filter((n) => n.carried).map((n) => n.id).sort()).toEqual(["google-analytics", "microsoft-clarity"]);
      expect(part.edges.filter((e) => e.carried).map((e) => e.id).sort()).toEqual([
        "landing-to-google-analytics",
        "landing-to-microsoft-clarity",
        "trading-app-to-google-analytics",
        "trading-app-to-microsoft-clarity",
      ]);
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

  it("keeps the carried copy of a node equal to what Part 1 built", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    const built = parts[0]!.nodes.find((n) => n.id === "google-analytics")!;
    const carried = parts[3]!.nodes.find((n) => n.id === "google-analytics")!;
    expect({ ...carried, x: 0, y: 0 }).toEqual({ ...built, x: 0, y: 0, carried: true, builtIn: "part-01" });
  });
});
