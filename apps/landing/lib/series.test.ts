import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("parseSeries", () => {
  it("parses the real content/series.json", () => {
    const content = readFileSync(join(repoRoot, "content", "series.json"), "utf8");
    const parts = parseSeries(content);

    expect(parts).toHaveLength(6);
    expect(parts[0]).toMatchObject({ part: 1, status: "next", url: "" });
    for (const part of parts.slice(1)) {
      expect(part.status).toBe("planned");
      expect(part.url).toBe("");
      expect(part.title.length).toBeGreaterThan(0);
    }
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseSeries("{ not json")).toThrow(/invalid JSON/);
  });

  it("throws a clear error when the top level isn't an array", () => {
    expect(() => parseSeries(JSON.stringify({ part: 1 }))).toThrow(/expected a JSON array/);
  });

  it("throws a clear error on an invalid status value", () => {
    const malformed = JSON.stringify([{ part: 1, title: "X", status: "shipped", url: "" }]);
    expect(() => parseSeries(malformed)).toThrow(/invalid "status"/);
  });

  it("throws a clear error when part is out of range", () => {
    const malformed = JSON.stringify([{ part: 9, title: "X", status: "planned", url: "" }]);
    expect(() => parseSeries(malformed)).toThrow(/invalid "part"/);
  });

  it("throws a clear error when title is missing", () => {
    const malformed = JSON.stringify([{ part: 1, status: "next", url: "" }]);
    expect(() => parseSeries(malformed)).toThrow(/missing a non-empty "title"/);
  });
});
