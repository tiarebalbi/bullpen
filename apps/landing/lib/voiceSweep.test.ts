import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdrs } from "./adr.js";
import { loadArchitectureParts } from "./architecture.js";
import { loadSeries } from "./series.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

// [Uu]s, not \bus\b, so "US" (the country) never false-positives -- the
// voice rule bans the pronoun "us", not the abbreviation.
function assertFirstPerson(label: string, text: string): void {
  expect(text, `${label} should not contain "we"`).not.toMatch(/\bwe\b/i);
  expect(text, `${label} should not contain "us"`).not.toMatch(/\b[Uu]s\b/);
  expect(text, `${label} should not contain "our"`).not.toMatch(/\bour\b/i);
  expect(text, `${label} should not name the author outside the byline/metadata/JSON-LD`).not.toContain("Tiarê Balbi");
  expect(text, `${label} should not name the author outside the byline/metadata/JSON-LD`).not.toContain("Tiare Balbi");
}

// document.body.innerText in e2e/seo.spec.ts only sees text that's actually
// rendered and visible: a closed <dialog> is display:none by the UA
// stylesheet, and only the currently-scrubbed architecture part's nodes are
// in the DOM. This file sweeps every source field directly instead, so ADR
// bodies, and every part's/every ADR's text, are covered regardless of
// what's on screen when the e2e test runs.
describe("first-person voice, swept over every source field (not just what's rendered on load)", () => {
  it("ADR titles, summaries and body sections (Context/Decision/Consequences/Alternatives/Links)", () => {
    const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
    for (const adr of adrs) {
      assertFirstPerson(`${adr.id} title`, adr.title);
      assertFirstPerson(`${adr.id} summary`, adr.summary);
      assertFirstPerson(`${adr.id} context`, adr.contextHtml);
      assertFirstPerson(`${adr.id} decision`, adr.decisionHtml);
      assertFirstPerson(`${adr.id} consequences`, adr.consequencesHtml);
      assertFirstPerson(`${adr.id} alternatives`, adr.alternativesHtml);
      assertFirstPerson(`${adr.id} links`, adr.linksHtml);
    }
  });

  it("content/series.json titles and introduced lines", () => {
    const series = loadSeries(join(repoRoot, "content", "series.json"));
    for (const part of series) {
      assertFirstPerson(`Part ${part.part} title`, part.title);
      assertFirstPerson(`Part ${part.part} introduced`, part.introduced);
    }
  });

  it("content/architecture/*.json node and request text, for every part (not just the initially-selected one)", () => {
    const parts = loadArchitectureParts(join(repoRoot, "content", "architecture"));
    for (const part of parts) {
      assertFirstPerson(`Part ${part.part} summary`, part.summary);
      for (const node of part.nodes) {
        assertFirstPerson(`Part ${part.part} node ${node.id} label`, node.label);
        assertFirstPerson(`Part ${part.part} node ${node.id} purpose`, node.purpose);
      }
      assertFirstPerson(`Part ${part.part} request name`, part.request.name);
      for (const step of part.request.steps) {
        assertFirstPerson(`Part ${part.part} request step caption`, step.caption);
        assertFirstPerson(`Part ${part.part} request step detail`, step.detail);
      }
    }
  });
});
