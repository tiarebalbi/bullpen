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
      expect(["Proposed", "Accepted"]).toContain(adr.status);
      expect(adr.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(adr.summary.length).toBeGreaterThan(0);
      expect(adr.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
      // A numbered part 1-6, or "bonus" (ADR-0027: the detour between Part 4 and Part 5).
      if (adr.part !== "bonus") {
        expect(adr.part).toBeGreaterThanOrEqual(1);
        expect(adr.part).toBeLessThanOrEqual(6);
      }
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

  it("reads only the first line of Status as the status, so a clarification line under it does not become the chip", () => {
    const adr = parseAdr(validAdr({ Status: "Proposed\n\nClarified 2026-10-09: builtIn is where the item was first built." }), "0099-fixture.md");
    expect(adr.status).toBe("Proposed");
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

describe("parseAdr: a change request and a bonus decision", () => {
  const request = "### Why now\n\n- Because of a reason.\n\n### In scope\n\n- One thing.\n\n### Out of scope\n\n- Another thing.";

  it("reads the three parts of a '## Change request' as HTML", () => {
    const adr = parseAdr(validAdr({ Part: "Bonus", "Change request": request }), "x.md");
    expect(adr.part).toBe("bonus");
    expect(adr.changeRequest?.whyNowHtml).toContain("<li>Because of a reason.</li>");
    expect(adr.changeRequest?.inScopeHtml).toContain("<li>One thing.</li>");
    expect(adr.changeRequest?.outOfScopeHtml).toContain("<li>Another thing.</li>");
  });

  it("has no change request unless the ADR has the section", () => {
    expect(parseAdr(validAdr(), "x.md").changeRequest).toBeUndefined();
  });

  it("refuses a change request that lacks one of its parts, naming it", () => {
    expect(() => parseAdr(validAdr({ "Change request": "### Why now\n\n- a\n\n### In scope\n\n- b" }), "x.md")).toThrow(/missing its "### Out of scope" part/);
  });

  it("escapes raw HTML in a change request, as in every section", () => {
    const adr = parseAdr(validAdr({ "Change request": request.replace("Because of a reason.", "<script>alert(1)</script>") }), "x.md");
    expect(adr.changeRequest?.whyNowHtml).not.toContain("<script>");
  });

  it("accepts Bonus (any case) for a part, and still refuses anything else that is not 1 to 6", () => {
    expect(parseAdr(validAdr({ Part: "bonus" }), "x.md").part).toBe("bonus");
    expect(() => parseAdr(validAdr({ Part: "7" }), "x.md")).toThrow(/integer 1-6 or "Bonus"/);
    expect(() => parseAdr(validAdr({ Part: "extra" }), "x.md")).toThrow(/integer 1-6 or "Bonus"/);
  });
});
