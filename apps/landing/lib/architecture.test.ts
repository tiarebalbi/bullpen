import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadArchitectureParts, parseArchitecturePart } from "./architecture.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const architectureDir = join(repoRoot, "content", "architecture");

describe("parseArchitecturePart / loadArchitectureParts", () => {
  it("parses all six real content/architecture/part-0N.json files", () => {
    const parts = loadArchitectureParts(architectureDir);
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
    const parts = loadArchitectureParts(architectureDir);
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
});
