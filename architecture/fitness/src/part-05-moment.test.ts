import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

/**
 * Part 5's built moment and its explorer content, published: the timeline points Part 5 at moments/part-05.architecture.json and current-moment is part-05.
 * The generic checks hold the explorer to its CALM document; this holds what is specific to Part 5: what was built, what was not, and what its numbers are.
 */
const read = (path: string) => JSON.parse(readFileSync(join(realRepoRoot, path), "utf8")) as Record<string, any>;
const moment = read("architecture/calm/moments/part-05.architecture.json");
const content = read("content/architecture/part-05.json");
const timeline = read("architecture/calm/bullpen.timeline.json");

describe("the Part 5 moment and explorer content", () => {
  it("draw the same nodes and the same edges", () => {
    expect(content.nodes.map((n: { id: string }) => n.id).sort()).toEqual(moment.nodes.map((n: { "unique-id": string }) => n["unique-id"]).sort());
    const relationships = moment.relationships.map((r: { "unique-id": string }) => r["unique-id"]).filter((id: string) => id !== "database-composition");
    expect(content.edges.map((e: { id: string }) => e.id).sort()).toEqual(relationships.sort());
  });

  it("say Part 5, are built, and are what the timeline points at and calls current", () => {
    expect(content.part).toBe(5);
    expect(content.status).toBe("built");
    expect(timeline["current-moment"]).toBe("part-05");
    const entry = timeline.moments.find((m: { "unique-id": string }) => m["unique-id"] === "part-05");
    expect(entry.details["detailed-architecture"]).toBe("moments/part-05.architecture.json");
    expect(entry.name).toBe("Part 5 \u2014 The market open: where the work waits");
    expect(entry.description).toBe(moment.description);
  });

  it("say that the numbers are a local run and that the hosted run and the cost table come in Part 6", () => {
    for (const text of [content.summary, moment.description, timeline.moments.find((m: { "unique-id": string }) => m["unique-id"] === "part-05").description]) {
      expect(text).toContain("local run on one machine");
      expect(text).toContain("says nothing about Vercel or Neon");
      expect(text).toContain("the hosted 1,000-player run and the cost table come in Part 6");
    }
  });

  it("link the five Part 5 decisions (ADR-0028 to ADR-0032), and none of the week-one prediction's two services appears: they were not built", () => {
    expect(moment.adrs).toEqual(expect.arrayContaining([expect.stringContaining("0028-"), expect.stringContaining("0029-"), expect.stringContaining("0030-"), expect.stringContaining("0031-"), expect.stringContaining("0032-")]));
    const ids = moment.nodes.map((n: { "unique-id": string }) => n["unique-id"]);
    expect(ids).not.toContain("market-open-queue");
    expect(ids).not.toContain("order-saga-workflow");
  });

  it("carry the latency budgets as controls on the trading app", () => {
    const controls = moment.nodes.find((n: { "unique-id": string }) => n["unique-id"] === "trading-app").controls;
    expect(Object.keys(controls)).toEqual(expect.arrayContaining(["order-latency-budget", "read-wait-budget", "stream-lifetime-budget", "admission-budget"]));
    expect(controls["order-latency-budget"].requirements[0].config.budget).toMatchObject({ metric: "p95", value: 1000, unit: "ms" });
  });
});
