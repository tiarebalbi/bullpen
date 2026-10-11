import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSeries } from "../lib/series.js";
import { PRIVACY_UPDATED } from "./lib/contentDates.js";
import sitemap from "./sitemap.js";

const series = parseSeries(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "series.json"), "utf8"));
const latest = series.filter((part) => part.status === "published").map((part) => part.date!).sort().at(-1);

afterEach(() => vi.useRealTimers());

describe("sitemap", () => {
  it("dates / and /architecture by the latest published part and /privacy by its own date", () => {
    const byPath = Object.fromEntries(sitemap().map((entry) => [new URL(entry.url).pathname, entry.lastModified]));
    expect(byPath).toEqual({ "/": latest, "/architecture": latest, "/privacy": PRIVACY_UPDATED });
  });

  it("is the same on two builds made at different times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T08:00:00Z"));
    const first = JSON.stringify(sitemap());
    vi.setSystemTime(new Date("2027-03-01T17:30:00Z"));
    expect(JSON.stringify(sitemap())).toBe(first);
  });
});
