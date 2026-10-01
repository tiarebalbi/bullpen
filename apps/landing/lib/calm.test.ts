import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentPart, loadCalmDocs, parseCalmDoc } from "./calm.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("parseCalmDoc", () => {
  it("reads nodes, their bullpen metadata and their controls", () => {
    const doc = parseCalmDoc(
      JSON.stringify({
        metadata: { part: 2 },
        nodes: [
          {
            "unique-id": "svc",
            "node-type": "service",
            name: "Svc",
            description: "Does a thing.",
            metadata: { "bullpen:path": "apps/web/app/api/price", "bullpen:libraries": ["packages/ui"] },
            controls: { secret: { description: "d", requirements: [{ config: { name: "N", description: "D", "enforced-by": "architecture/fitness/src/secret-check.ts" } }] } },
          },
        ],
        relationships: [
          { "unique-id": "a-to-b", description: "A calls B.", "relationship-type": { connects: { source: { node: "a" }, destination: { node: "b" } } }, protocol: "HTTPS", metadata: { interaction: "synchronous" } },
          { "unique-id": "p-to-a", description: "P opens A.", "relationship-type": { interacts: { actor: "p", nodes: ["a"] } } },
        ],
      }),
      "moments",
      "x",
    );

    expect(doc.part).toBe(2);
    expect(doc.nodes[0]).toMatchObject({ id: "svc", path: "apps/web/app/api/price", libraries: ["packages/ui"] });
    expect(doc.nodes[0]!.controls[0]!.requirements[0]).toEqual({ name: "N", description: "D", enforcedBy: "architecture/fitness/src/secret-check.ts" });
    expect(doc.relationships).toMatchObject([
      { id: "a-to-b", kind: "connects", source: "a", destination: "b", protocol: "HTTPS", interaction: "synchronous" },
      { id: "p-to-a", kind: "interacts", actor: "p", nodes: ["a"] },
    ]);
  });

  it("throws a descriptive error for a document that is not one", () => {
    expect(() => parseCalmDoc("not json", "moments", "f.json")).toThrow(/f\.json: invalid JSON/);
    expect(() => parseCalmDoc(JSON.stringify({ nodes: [] }), "moments", "f.json")).toThrow(/metadata\.part/);
    expect(() => parseCalmDoc(JSON.stringify({ metadata: { part: 1 } }), "moments", "f.json")).toThrow(/"nodes"/);
  });
});

describe("the real repo", () => {
  it("has a built moment for Parts 1 and 2 and a planned one for Parts 3 to 6", () => {
    const docs = loadCalmDocs(repoRoot);
    expect([...docs].map(([part, doc]) => `${part}:${doc.origin}`)).toEqual(["1:moments", "2:moments", "3:planned", "4:planned", "5:planned", "6:planned"]);
  });

  it("reads Part 2's controls and the check that enforces each", () => {
    const part2 = loadCalmDocs(repoRoot).get(2)!;
    const enforcedBy = [...part2.nodes.flatMap((n) => n.controls), ...part2.relationships.flatMap((r) => r.controls)].flatMap((c) => c.requirements).map((r) => r.enforcedBy).filter(Boolean);
    expect(enforcedBy).toEqual(expect.arrayContaining(["architecture/fitness/src/boundaries-check.ts", "architecture/fitness/src/secret-check.ts", "architecture/fitness/src/budget-check.ts"]));
  });

  it("reads the timeline's current moment as a part number, and falls back to 1 if it cannot", () => {
    const timeline = JSON.parse(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8")) as { "current-moment": string };
    expect(currentPart(repoRoot)).toBe(Number(/^part-0?(\d)$/.exec(timeline["current-moment"])![1]));
    expect(currentPart(join(repoRoot, "nowhere"))).toBe(1);
  });
});
