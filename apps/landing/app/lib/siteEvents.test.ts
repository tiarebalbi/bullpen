import { describe, expect, it } from "vitest";
import { adrNumberFromHash, seriesPartFromLabel } from "./siteEvents.js";

describe("adrNumberFromHash", () => {
  it("reads an ADR hash as its number", () => {
    expect(adrNumberFromHash("#adr-0002")).toBe(2);
    expect(adrNumberFromHash("#adr-0010")).toBe(10);
  });
  it("ignores every other hash", () => {
    expect(adrNumberFromHash("")).toBeNull();
    expect(adrNumberFromHash("#series")).toBeNull();
    expect(adrNumberFromHash("#adr-2")).toBeNull();
    expect(adrNumberFromHash("#adr-0002x")).toBeNull();
  });
});

describe("seriesPartFromLabel", () => {
  it("reads a series card's label", () => {
    expect(seriesPartFromLabel("Part 1")).toBe(1);
    expect(seriesPartFromLabel(" Part 6 ")).toBe(6);
  });
  it("is null for anything else", () => {
    expect(seriesPartFromLabel("Published")).toBeNull();
    expect(seriesPartFromLabel(undefined)).toBeNull();
  });
});
