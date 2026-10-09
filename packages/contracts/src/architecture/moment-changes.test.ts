import { describe, expect, it } from "vitest";
import { adrIdOfFile, momentChanges, type CalmChangeDoc } from "./moment-changes.js";

const control = (description?: string) => (description === undefined ? {} : { description });

const PART_1: CalmChangeDoc = {
  nodes: [
    { "unique-id": "app", name: "The App", controls: { consent: control("Nothing loads before consent.") } },
    { "unique-id": "svc", name: "The Service" },
    { "unique-id": "ext", name: "The Provider" },
  ],
  relationships: [{ "unique-id": "svc-to-ext", "relationship-type": { connects: { source: { node: "svc" }, destination: { node: "ext" } } } }],
};

const PART_2: CalmChangeDoc = {
  nodes: [
    { "unique-id": "app", name: "The App", controls: { consent: control("Nothing loads before consent."), boundaries: control("Apps never import apps.") } },
    { "unique-id": "svc", name: "The Service", controls: { secrets: control() } },
    { "unique-id": "ext", name: "The Provider" },
  ],
  relationships: [
    {
      "unique-id": "svc-to-ext",
      controls: { budget: control("Stays inside the allowance."), secrets: control("Key stays in one route.") },
      "relationship-type": { connects: { source: { node: "svc" }, destination: { node: "ext" } } },
    },
  ],
};

describe("momentChanges", () => {
  it("lists only the controls a moment added to nodes and relationships that were already there, then its ADRs", () => {
    expect(momentChanges(PART_1, PART_2, ["architecture/adr/0001-stack.md"], ["architecture/adr/0009-guardrails.md"])).toEqual([
      { kind: "controls", target: "The App", controls: [{ key: "boundaries", description: "Apps never import apps." }] },
      { kind: "controls", target: "The Service", controls: [{ key: "secrets" }] },
      {
        kind: "controls",
        target: "The Service → The Provider",
        controls: [
          { key: "budget", description: "Stays inside the allowance." },
          { key: "secrets", description: "Key stays in one route." },
        ],
      },
      { kind: "adr", adr: "ADR-0009" },
    ]);
  });

  it("does not list a control the previous moment already had", () => {
    expect(momentChanges(PART_2, PART_2, [], [])).toEqual([]);
  });

  it("leaves a new node's controls to its row as an added node", () => {
    const next: CalmChangeDoc = { nodes: [...PART_1.nodes!, { "unique-id": "new", name: "New", controls: { c: control("x") } }], relationships: PART_1.relationships };
    expect(momentChanges(PART_1, next, [], [])).toEqual([]);
  });

  it("does not repeat an ADR the previous moment links", () => {
    const adr = "architecture/adr/0010-analytics.md";
    expect(momentChanges(PART_1, PART_1, [adr], [adr, "architecture/adr/0011-carry.md"])).toEqual([{ kind: "adr", adr: "ADR-0011" }]);
  });

  it("reads a control's key as its name when the model gives no description", () => {
    expect(momentChanges({ nodes: [{ "unique-id": "n" }] }, { nodes: [{ "unique-id": "n", controls: { k: {} } }] }, [], [])).toEqual([
      { kind: "controls", target: "n", controls: [{ key: "k" }] },
    ]);
  });
});

describe("adrIdOfFile", () => {
  it("reads the number from the file name", () => {
    expect(adrIdOfFile("architecture/adr/0009-guardrails-enforced-not-requested.md")).toBe("ADR-0009");
    expect(adrIdOfFile("notes.md")).toBeNull();
  });
});
