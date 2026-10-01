import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTRODUCED_MAX_LENGTH, TITLE_MAX_LENGTH, formatPublishDate, parseSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("parseSeries", () => {
  it("parses the real content/series.json, within the design's card copy budget", () => {
    const content = readFileSync(join(repoRoot, "content", "series.json"), "utf8");
    const parts = parseSeries(content);

    expect(parts).toHaveLength(6);
    expect(parts[0]).toMatchObject({
      part: 1,
      status: "published",
      url: "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026",
      date: "2026-10-04",
    });
    expect(parts[1]).toMatchObject({
      part: 2,
      status: "published",
      url: "https://tiarebalbi.com/en/blog/architecture-as-code-describe-govern-remember",
      date: "2026-10-11",
    });
    expect(parts[2]).toMatchObject({ part: 3, status: "next", url: "", date: null });
    for (const part of parts.slice(3)) {
      expect(part.status).toBe("planned");
      expect(part.url).toBe("");
      expect(part.date).toBeNull();
    }
    for (const part of parts) {
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

  it("throws when a published part has neither a url nor a date: it has to link its post and say when", () => {
    const malformed = JSON.stringify([{ part: 1, title: "X", status: "published", url: "", introduced: "Y", date: null }]);
    expect(() => parseSeries(malformed)).toThrow(/is "published" but has no "url" and "date"/);
  });

  it("throws when a part that is not published has a url and a date", () => {
    for (const status of ["next", "planned"]) {
      const malformed = JSON.stringify([{ part: 1, title: "X", status, url: "https://x.test", introduced: "Y", date: "2026-10-04" }]);
      expect(() => parseSeries(malformed), status).toThrow(new RegExp(`is "${status}" but has a "url" and "date" -- only a published part has them`));
    }
  });

  it("throws when more than one part is next", () => {
    const malformed = JSON.stringify([
      { part: 1, title: "X", status: "next", url: "", introduced: "Y", date: null },
      { part: 2, title: "X", status: "next", url: "", introduced: "Y", date: null },
    ]);
    expect(() => parseSeries(malformed)).toThrow(/parts 1 and 2 are all "next" -- only one part is next/);
  });

  it("accepts a published part followed by the next one and then the planned ones", () => {
    const valid = JSON.stringify([
      { part: 1, title: "A", status: "published", url: "https://x.test/a", introduced: "Y", date: "2026-10-04" },
      { part: 2, title: "B", status: "next", url: "", introduced: "Y", date: null },
      { part: 3, title: "C", status: "planned", url: "", introduced: "Y", date: null },
    ]);
    expect(parseSeries(valid).map((part) => part.status)).toEqual(["published", "next", "planned"]);
  });
});

describe("formatPublishDate", () => {
  it("writes a calendar date as the card shows it", () => {
    expect(formatPublishDate("2026-10-04")).toBe("Oct 4, 2026");
    expect(formatPublishDate("2026-10-11")).toBe("Oct 11, 2026");
  });

  it("is the same day in every time zone, west of UTC and east of it", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Los_Angeles", "America/Sao_Paulo", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati"]) {
        process.env.TZ = zone;
        expect(formatPublishDate("2026-10-04"), zone).toBe("Oct 4, 2026");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
