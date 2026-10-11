import { describe, expect, it } from "vitest";
import type { SeriesPart } from "../../lib/series.js";
import { formatLongDate, latestPublishedDate } from "./contentDates.js";

const part = (n: number, status: SeriesPart["status"], date: string | null): SeriesPart => ({
  part: n,
  title: "T",
  status,
  url: date ? "https://x.test/p" : "",
  introduced: "X",
  date,
});

describe("latestPublishedDate", () => {
  it("is the latest date among the published parts, whatever the order", () => {
    expect(latestPublishedDate([part(2, "published", "2026-10-11"), part(1, "published", "2026-10-04"), part(3, "next", null)])).toBe("2026-10-11");
  });

  it("is null while nothing is published", () => {
    expect(latestPublishedDate([part(1, "next", null), part(2, "planned", null)])).toBeNull();
  });
});

describe("formatLongDate", () => {
  it("shows a calendar date as that day, not the day before in a western time zone", () => {
    expect(formatLongDate("2026-10-01")).toBe("1 October 2026");
  });
});
