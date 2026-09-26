import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTRODUCED_MAX_LENGTH, TITLE_MAX_LENGTH, parseSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("parseSeries", () => {
  it("parses the real content/series.json, within the design's card copy budget", () => {
    const content = readFileSync(join(repoRoot, "content", "series.json"), "utf8");
    const parts = parseSeries(content);

    expect(parts).toHaveLength(6);
    expect(parts[0]).toMatchObject({ part: 1, status: "next", url: "", date: null });
    for (const part of parts.slice(1)) {
      expect(part.status).toBe("planned");
      expect(part.url).toBe("");
      expect(part.date).toBeNull();
      expect(part.title.length).toBeGreaterThan(0);
      expect(part.introduced.length).toBeGreaterThan(0);
    }
    for (const part of parts) {
      expect(part.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      expect(part.introduced.length).toBeLessThanOrEqual(INTRODUCED_MAX_LENGTH);
    }
  });

  it("throws when a title exceeds the card's title budget", () => {
    const malformed = JSON.stringify([
      {
        part: 1,
        title: "A title so long it will never fit the design's two-line card",
        status: "next",
        url: "",
        introduced: "Y",
        date: null,
      },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/over the 28-character card budget/);
  });

  it("throws when an introduced line exceeds the card's introduced budget", () => {
    const malformed = JSON.stringify([
      {
        part: 1,
        title: "X",
        status: "next",
        url: "",
        introduced:
          "An introduced line so long it will never fit inside the design's two-line budget for this card",
        date: null,
      },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/over the 60-character card budget/);
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseSeries("{ not json")).toThrow(/invalid JSON/);
  });

  it("throws a clear error when the top level isn't an array", () => {
    expect(() => parseSeries(JSON.stringify({ part: 1 }))).toThrow(/expected a JSON array/);
  });

  it("throws a clear error on an invalid status value", () => {
    const malformed = JSON.stringify([
      { part: 1, title: "X", status: "shipped", url: "", introduced: "Y", date: null },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/invalid "status"/);
  });

  it("accepts the 'published' status", () => {
    const valid = JSON.stringify([
      { part: 1, title: "X", status: "published", url: "https://x.test", introduced: "Y", date: "2026-10-04" },
    ]);
    expect(() => parseSeries(valid)).not.toThrow();
  });

  it("throws a clear error when part is out of range", () => {
    const malformed = JSON.stringify([
      { part: 9, title: "X", status: "planned", url: "", introduced: "Y", date: null },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/invalid "part"/);
  });

  it("throws a clear error when title is missing", () => {
    const malformed = JSON.stringify([{ part: 1, status: "next", url: "", introduced: "Y", date: null }]);
    expect(() => parseSeries(malformed)).toThrow(/missing a non-empty "title"/);
  });

  it("throws a clear error when introduced is missing", () => {
    const malformed = JSON.stringify([{ part: 1, title: "X", status: "next", url: "", date: null }]);
    expect(() => parseSeries(malformed)).toThrow(/missing a non-empty "introduced"/);
  });

  it("throws when a part has a date but no url", () => {
    const malformed = JSON.stringify([
      { part: 1, title: "X", status: "next", url: "", introduced: "Y", date: "2026-10-04" },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/has a "date" but no "url"/);
  });

  it("throws when a part has a url but no date", () => {
    const malformed = JSON.stringify([
      { part: 1, title: "X", status: "published", url: "https://x.test", introduced: "Y", date: null },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/has a "url" but no "date"/);
  });
});
