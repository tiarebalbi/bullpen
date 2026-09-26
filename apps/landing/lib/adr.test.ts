import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdrs, parseAdr } from "./adr.js";

const adrDir = join(import.meta.dirname, "..", "..", "..", "architecture", "adr");

describe("loadAdrs / parseAdr", () => {
  it("parses every real ADR file in architecture/adr/", () => {
    const adrs = loadAdrs(adrDir);

    expect(adrs.length).toBeGreaterThanOrEqual(3);
    for (const adr of adrs) {
      expect(adr.id).toMatch(/^ADR-\d{4}$/);
      expect(adr.title.length).toBeGreaterThan(0);
      expect(adr.status).toBe("Accepted");
      expect(adr.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(adr.contextExcerpt.length).toBeGreaterThan(0);
      expect(adr.decisionExcerpt.length).toBeGreaterThan(0);
    }
  });

  it("throws a clear error when a required section is missing", () => {
    const malformed = [
      "# ADR-0099: Missing decision",
      "",
      "## Status",
      "",
      "Accepted",
      "",
      "## Date",
      "",
      "2026-01-01",
      "",
      "## Context",
      "",
      "Some context, no Decision section follows.",
      "",
    ].join("\n");

    expect(() => parseAdr(malformed, "0099-missing-decision.md")).toThrow(
      /missing required "## Decision" section/,
    );
  });

  it("throws a clear error when the title heading is malformed", () => {
    const malformed = "## Status\n\nAccepted\n";
    expect(() => parseAdr(malformed, "bad.md")).toThrow(/missing a "# ADR-NNNN: Title" heading/);
  });

  it("throws when the directory has no markdown files", () => {
    expect(() => loadAdrs(join(import.meta.dirname))).toThrow(/no ADR markdown files found/);
  });
});
