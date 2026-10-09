import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdrs } from "./adr.js";
import { loadArchitectureParts } from "./architecture.js";
import { loadSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

// A raw backtick or "](" in one of these PLAIN-TEXT fields means Markdown
// syntax leaked in somewhere it's rendered as literal text, not parsed
// (only the ADR body sections -- Context/Decision/Consequences/
// Alternatives/Links -- are meant to contain Markdown; those go through
// markdown-it, see ADR-0007, and are exempt from this check).
function assertNoRawMarkdown(label: string, text: string): void {
  expect(text, `${label} should not contain a literal backtick`).not.toContain("`");
  expect(text, `${label} should not contain raw markdown link syntax`).not.toContain("](");
}

describe("no raw markdown in plain-text display fields", () => {
  it("ADR titles and summaries", () => {
    const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
    for (const adr of adrs) {
      assertNoRawMarkdown(`${adr.id} title`, adr.title);
      assertNoRawMarkdown(`${adr.id} summary`, adr.summary);
    }
  });

  it("content/series.json titles and introduced lines", () => {
    const series = loadSeries(join(repoRoot, "content", "series.json"));
    for (const part of series) {
      assertNoRawMarkdown(`Part ${part.part} title`, part.title);
      assertNoRawMarkdown(`Part ${part.part} introduced`, part.introduced);
    }
  });

  it("content/architecture/*.json node and request text", () => {
    const parts = loadArchitectureParts(join(repoRoot, "content", "architecture"), join(repoRoot, "architecture", "calm", "planned"));
    for (const part of parts) {
      assertNoRawMarkdown(`Part ${part.part} summary`, part.summary);
      for (const node of part.nodes) {
        assertNoRawMarkdown(`Part ${part.part} node ${node.id} label`, node.label);
        assertNoRawMarkdown(`Part ${part.part} node ${node.id} purpose`, node.purpose);
      }
      assertNoRawMarkdown(`Part ${part.part} request name`, part.request.name);
      for (const step of part.request.steps) {
        assertNoRawMarkdown(`Part ${part.part} request step caption`, step.caption);
        assertNoRawMarkdown(`Part ${part.part} request step detail`, step.detail);
      }
    }
  });
});
