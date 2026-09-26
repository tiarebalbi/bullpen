import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUMMARY_MAX_LENGTH, loadAdrs, parseAdr } from "./adr.js";

const adrDir = join(import.meta.dirname, "..", "..", "..", "architecture", "adr");

// A complete, valid fixture with every required section -- individual tests
// below delete or corrupt one field at a time rather than repeat all nine
// sections by hand each time.
function validAdr(overrides: Record<string, string> = {}): string {
  const sections: Record<string, string> = {
    Status: "Accepted",
    Date: "2026-01-01",
    Summary: "A one-line summary",
    Part: "1",
    Context: "Some context.",
    Decision: "Some decision.",
    Consequences: "- One consequence.",
    Alternatives: "- **Rejected option** -- rejected, for a reason.",
    Links: "- ADR-0001 -- a related decision.",
    ...overrides,
  };
  const lines = ["# ADR-0099: Fixture"];
  for (const [heading, body] of Object.entries(sections)) {
    if (body === "") continue;
    lines.push("", `## ${heading}`, "", body);
  }
  return lines.join("\n") + "\n";
}

describe("loadAdrs / parseAdr", () => {
  it("parses every real ADR file in architecture/adr/", () => {
    const adrs = loadAdrs(adrDir);

    expect(adrs.length).toBeGreaterThanOrEqual(3);
    for (const adr of adrs) {
      expect(adr.id).toMatch(/^ADR-\d{4}$/);
      expect(adr.title.length).toBeGreaterThan(0);
      expect(adr.status).toBe("Accepted");
      expect(adr.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(adr.summary.length).toBeGreaterThan(0);
      expect(adr.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
      expect(adr.part).toBeGreaterThanOrEqual(1);
      expect(adr.part).toBeLessThanOrEqual(6);
      expect(adr.contextHtml).toContain("<p>");
      expect(adr.decisionHtml).toContain("<p>");
      expect(adr.consequencesHtml.length).toBeGreaterThan(0);
      expect(adr.alternativesHtml.length).toBeGreaterThan(0);
      expect(adr.linksHtml.length).toBeGreaterThan(0);
    }
  });

  it("renders Markdown lists and emphasis to real HTML, and never passes through raw HTML", () => {
    const adrs = loadAdrs(adrDir);
    const withConsequences = adrs.find((a) => a.consequencesHtml.includes("<li>"));
    expect(withConsequences).toBeDefined();

    const withRawHtml = parseAdr(validAdr({ Context: "Text with <script>alert(1)</script> inside." }), "raw-html.md");
    expect(withRawHtml.contextHtml).not.toContain("<script>");
    expect(withRawHtml.contextHtml).toContain("&lt;script&gt;");
  });

  it("throws a clear error when a required section is missing", () => {
    expect(() => parseAdr(validAdr({ Decision: "" }), "0099-missing-decision.md")).toThrow(
      /missing required "## Decision" section/,
    );
  });

  it("throws a clear error when the summary is missing", () => {
    expect(() => parseAdr(validAdr({ Summary: "" }), "0099-missing-summary.md")).toThrow(
      /missing required "## Summary" section/,
    );
  });

  it("throws when the summary exceeds the row's character budget", () => {
    const tooLong = "A".repeat(SUMMARY_MAX_LENGTH + 1);
    expect(() => parseAdr(validAdr({ Summary: tooLong }), "0099-summary-too-long.md")).toThrow(
      /over the 60-character row budget/,
    );
  });

  it("throws a clear error when the Part section is missing", () => {
    expect(() => parseAdr(validAdr({ Part: "" }), "0099-missing-part.md")).toThrow(/missing required "## Part" section/);
  });

  it("throws when Part is out of the 1-6 range", () => {
    expect(() => parseAdr(validAdr({ Part: "7" }), "0099-part-out-of-range.md")).toThrow(
      /"## Part" must be an integer 1-6/,
    );
  });

  it("throws when Part isn't a number", () => {
    expect(() => parseAdr(validAdr({ Part: "one" }), "0099-part-not-a-number.md")).toThrow(
      /"## Part" must be an integer 1-6/,
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
