import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadArchitectureParts, parseArchitecturePart, predictionOfPart } from "./architecture.js";

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

  it("derives ownership groups from db-owning services and their connected data nodes, when a part writes none of its own", () => {
    const content = JSON.stringify({
      part: 3,
      status: "planned",
      summary: "s",
      nodes: [
        { id: "svc", label: "Service", kind: "service", meta: "m", purpose: "p", x: 0, y: 0, db: true },
        { id: "store", label: "Store", kind: "data", meta: "m", purpose: "p", x: 0, y: 100 },
        { id: "lonely", label: "Lonely", kind: "service", meta: "m", purpose: "p", x: 200, y: 0, db: true },
      ],
      edges: [{ id: "svc-to-store", a: "svc", b: "store", type: "sync" }],
      groups: [],
      request: { name: "r", steps: [{ edge: "svc-to-store", caption: "c", detail: "d" }] },
    });
    // A service with a database and no data node wired to it stays ungrouped rather than padded into a group with nothing real in it.
    expect(parseArchitecturePart(content, "fixture").groups).toEqual([{ id: "svc-owns", label: "Service", nodeIds: ["svc", "store"] }]);
  });

  it("uses the groups a part writes, and the real Part 1 has none", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    expect(parts.find((p) => p.part === 1)!.groups).toEqual([]);
    expect(parts.find((p) => p.part === 3)!.groups).toEqual([
      { id: "vercel-project", label: "One Vercel project, shared release", nodeIds: ["trading-app", "market-data-service"] },
      { id: "neon-database", label: "One Neon database", nodeIds: ["bullpen-database", "schema-trading", "schema-market-data", "prices-v1"] },
    ]);
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

  it("carries the built analytics nodes and edges into every planned part that does not name them (4 to 6), and nothing else", () => {
    const parts = loadArchitectureParts(architectureDir, plannedDir);
    // Part 3 draws the analytics nodes itself, so it carries nothing.
    for (const own of parts.slice(0, 3)) expect(own.nodes.some((n) => n.carried)).toBe(false);
    for (const part of parts.slice(3)) {
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

    it("names the node a change belongs to by its id, and leaves a connection's change without one", () => {
      const changes = loadArchitectureParts(architectureDir, plannedDir, calmDir)[1]!.changes!.filter((c) => c.kind === "controls");
      expect(changes.map((c) => [c.target, c.nodeId])).toEqual([
        ["Bullpen Landing", "landing-app"],
        ["Bullpen Trading App", "trading-app"],
        ["Price Snapshot Service", "price-snapshot-service"],
        ["Price Snapshot Service → CoinGecko", undefined],
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

describe("predictionOfPart: what week one predicted and the part did not build", () => {
  it("names the Prices and Market History services and databases that Part 3 did not build, and the tag", () => {
    const prediction = predictionOfPart(3, plannedDir, calmDir);
    expect(prediction).toEqual({
      tag: "predictions-week-1",
      tagUrl: "https://github.com/tiarebalbi/bullpen/tree/predictions-week-1",
      notBuilt: [
        { id: "prices-service", label: "Prices Service" },
        { id: "prices-db", label: "Prices Database" },
        { id: "market-history-service", label: "Market History Service" },
        { id: "market-history-db", label: "Market History Database" },
      ],
    });
  });

  it("has nothing for a part whose prediction was built as written, or that had none", () => {
    expect(predictionOfPart(2, plannedDir, calmDir)).toBeNull();
    expect(predictionOfPart(1, plannedDir, calmDir)).toBeNull();
    expect(predictionOfPart(4, plannedDir, calmDir)).toBeNull(); // not built: there is no moment to compare with
  });
});

describe("parseArchitecturePart: the fields Part 3 adds", () => {
  const base = () => ({
    part: 3,
    status: "planned",
    summary: "s",
    nodes: [
      { id: "a", label: "A", kind: "service", meta: "m", purpose: "p", x: 0, y: 0 },
      { id: "b", label: "B", kind: "data", meta: "m", purpose: "p", x: 0, y: 100, owner: "a", replaces: ["old"] },
    ],
    edges: [{ id: "a-to-b", a: "a", b: "b", type: "sync", label: "role · write" }],
    groups: [],
    request: { name: "r", steps: [{ edge: "a-to-b", caption: "c", detail: "d" }] },
    requests: [{ name: "second", steps: [{ edge: "a-to-b", caption: "c", detail: "d" }] }],
  });
  const parse = (value: unknown) => parseArchitecturePart(JSON.stringify(value), "fixture");

  it("accepts an owner, replaced ids, an edge label and further requests", () => {
    const part = parse(base());
    expect(part.nodes[1]).toMatchObject({ owner: "a", replaces: ["old"] });
    expect(part.edges[0]).toMatchObject({ label: "role · write" });
    expect(part.requests?.[0]?.name).toBe("second");
  });

  it("rejects an owner that is not a node, or is the node itself", () => {
    const missing = base();
    missing.nodes[1]!.owner = "nobody";
    expect(() => parse(missing)).toThrow(/owner "nobody" that is not in "nodes"/);
    const self = base();
    self.nodes[1]!.owner = "b";
    expect(() => parse(self)).toThrow(/invalid "owner"/);
  });

  it("rejects an empty edge label, a bad replaces, and a further request on an edge that does not exist", () => {
    const label = base();
    label.edges[0]!.label = "";
    expect(() => parse(label)).toThrow(/empty or non-string "label"/);
    const replaces = base();
    (replaces.nodes[1] as Record<string, unknown>).replaces = "old";
    expect(() => parse(replaces)).toThrow(/invalid "replaces"/);
    const request = base();
    request.requests[0]!.steps[0]!.edge = "ghost";
    expect(() => parse(request)).toThrow(/requests\[0\] step 0 references an edge id not present/);
  });
});

describe("Part 3's explorer content is the moment, drawn", () => {
  const moment = JSON.parse(readFileSync(join(calmDir, "moments", "part-03.architecture.json"), "utf8")) as {
    nodes: Array<{ "unique-id": string; metadata?: Record<string, unknown> }>;
    relationships: Array<{ "unique-id": string; protocol?: string; metadata?: { label?: string }; "relationship-type": { "composed-of"?: { container: string; nodes: string[] } } }>;
  };
  const part3 = loadArchitectureParts(architectureDir, plannedDir).find((p) => p.part === 3)!;

  it("boxes the nodes the moment puts in one release, under the label the moment gives them", () => {
    const byLabel = new Map<string, string[]>();
    for (const node of moment.nodes) {
      const group = node.metadata?.["bullpen:group"];
      if (typeof group === "string") byLabel.set(group, [...(byLabel.get(group) ?? []), node["unique-id"]]);
    }
    expect([...byLabel]).toEqual([["One Vercel project, shared release", ["trading-app", "market-data-service"]]]);
    for (const [label, ids] of byLabel) expect(part3.groups.find((g) => g.label === label)?.nodeIds.sort()).toEqual([...ids].sort());
  });

  it("boxes the database with the schemas the moment says it is composed of", () => {
    const composed = moment.relationships.map((r) => r["relationship-type"]["composed-of"]).find(Boolean)!;
    const box = part3.groups.find((g) => g.nodeIds.includes(composed.container))!;
    expect(box.nodeIds.sort()).toEqual([composed.container, ...composed.nodes].sort());
  });

  it("labels each database connection with the role and access the moment gives it, and no other", () => {
    const fromMoment = Object.fromEntries(moment.relationships.filter((r) => r.metadata?.label).map((r) => [r["unique-id"], r.metadata!.label]));
    const fromContent = Object.fromEntries(part3.edges.filter((e) => e.label).map((e) => [e.id, e.label]));
    expect(fromContent).toEqual(fromMoment);
    expect(Object.keys(fromContent).sort()).toEqual(["market-data-to-market-data-schema", "trading-app-to-prices-v1", "trading-app-to-trading-schema"]);
    for (const relationship of moment.relationships.filter((r) => r.protocol === "JDBC")) expect(relationship.metadata?.label, relationship["unique-id"]).toBeTruthy();
  });

  it("says each schema's owner is the node that connects to it as the role that may write it", () => {
    expect(Object.fromEntries(part3.nodes.filter((n) => n.owner).map((n) => [n.id, n.owner]))).toEqual({
      "schema-trading": "trading-app",
      "schema-market-data": "market-data-service",
      "prices-v1": "market-data-service",
    });
  });

  it("says the Market Data Service took over the Price Snapshot Service", () => {
    expect(part3.nodes.find((n) => n.id === "market-data-service")!.replaces).toEqual(["price-snapshot-service"]);
  });
});
