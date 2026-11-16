import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realRepoRoot } from "./test-helpers.js";

/**
 * Part 5's built moment and its explorer content are staged, not wired: the timeline still points Part 5 at the prediction and current-moment is the bonus, so the live
 * architecture page keeps showing the prediction until the publish PR (which moves the staged content over content/architecture/part-05.json as "built", points the timeline
 * at moments/part-05.architecture.json and sets current-moment). Until then nothing else reads these two files, so this is the check that they agree.
 */
const read = (path: string) => JSON.parse(readFileSync(join(realRepoRoot, path), "utf8")) as Record<string, any>;
const moment = read("architecture/calm/staged/part-05.architecture.json");
const content = read("content/architecture/staged/part-05.json");

describe("the staged Part 5 moment and explorer content", () => {
  it("draw the same nodes and the same edges", () => {
    expect(content.nodes.map((n: { id: string }) => n.id).sort()).toEqual(moment.nodes.map((n: { "unique-id": string }) => n["unique-id"]).sort());
    const relationships = moment.relationships.map((r: { "unique-id": string }) => r["unique-id"]).filter((id: string) => id !== "database-composition");
    expect(content.edges.map((e: { id: string }) => e.id).sort()).toEqual(relationships.sort());
  });

  it("say Part 5, and are still planned: the status becomes built in the publish PR, with current-moment", () => {
    expect(content.part).toBe(5);
    expect(content.status).toBe("planned");
    expect(read("architecture/calm/bullpen.timeline.json")["current-moment"]).toBe("bonus-handles");
  });

  it("link the four Part 5 decisions, and none of the week-one prediction's two services appears: they were not built", () => {
    expect(moment.adrs).toEqual(expect.arrayContaining([expect.stringContaining("0028-"), expect.stringContaining("0029-"), expect.stringContaining("0030-"), expect.stringContaining("0031-")]));
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
