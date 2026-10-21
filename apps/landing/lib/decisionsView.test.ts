import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdrs, type Adr } from "./adr.js";
import { DECISIONS_SHOWN, buildDecisionsView } from "./decisionsView.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adr = (id: number, part: number): Adr => ({ id: `ADR-${String(id).padStart(4, "0")}`, part, title: `T${id}`, summary: `S${id}`, status: "Accepted", date: "2026-10-01", contextHtml: "", decisionHtml: "", consequencesHtml: "", alternativesHtml: "", linksHtml: "", filename: `${id}.md` });
const fixture = [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => adr(n, 1)), adr(9, 2), adr(10, 2), ...[11, 12, 13, 14, 15, 16, 17].map((n) => adr(n, 3))];

describe("buildDecisionsView", () => {
  it("makes a tab for All and one for each part that has a decision, with its count", () => {
    const view = buildDecisionsView(fixture);
    expect(view.tabs.map((t) => [t.label, t.count, t.selected])).toEqual([["All", 17, true], ["Part 1", 8, false], ["Part 2", 2, false], ["Part 3", 7, false]]);
  });

  it("shows six rows and a View all button when there are more, and the caption says so", () => {
    const view = buildDecisionsView(fixture);
    expect(view.rows).toHaveLength(DECISIONS_SHOWN);
    expect(view.caption).toBe("6 of 17 decisions");
    expect(view.more).toEqual({ show: true, expanded: false, label: "View all 17 →" });
  });

  it("filters to a part: 6 of 7 in Part 3, with the button", () => {
    const view = buildDecisionsView(fixture, 3);
    expect(view.rows.map((r) => r.id)).toEqual(["ADR-0011", "ADR-0012", "ADR-0013", "ADR-0014", "ADR-0015", "ADR-0016"]);
    expect(view.caption).toBe("6 of 7 in Part 3");
    expect(view.more.label).toBe("View all 7 →");
    expect(view.tabs.find((t) => t.selected)?.label).toBe("Part 3");
  });

  it("expands in place to every decision of the filter, and offers Show fewer", () => {
    const view = buildDecisionsView(fixture, 3, true);
    expect(view.rows).toHaveLength(7);
    expect(view.caption).toBe("7 of 7 in Part 3");
    expect(view.more).toEqual({ show: true, expanded: true, label: "Show fewer" });
  });

  it("has no button for a part with six or fewer, and the caption counts them all", () => {
    const view = buildDecisionsView(fixture, 2);
    expect(view.rows).toHaveLength(2);
    expect(view.caption).toBe("2 of 2 in Part 2");
    expect(view.more.show).toBe(false);
    expect(buildDecisionsView(fixture, 2, true).more).toEqual({ show: false, expanded: false, label: "View all 2 →" });
  });

  it("falls back to All for a part with no decision", () => {
    expect(buildDecisionsView(fixture, 5).part).toBe("all");
  });

  it("a new ADR in a new part adds a tab and changes the counts with no copy edit", () => {
    const view = buildDecisionsView([...fixture, adr(18, 4)]);
    expect(view.tabs.map((t) => t.label)).toEqual(["All", "Part 1", "Part 2", "Part 3", "Part 4"]);
    expect(view.tabs[0]!.count).toBe(18);
  });

  it("reads the real ADR files: the tabs are the parts they name and the counts add up", () => {
    const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
    const view = buildDecisionsView(adrs);
    expect(view.tabs[0]!.count).toBe(adrs.length);
    expect(view.tabs.slice(1).reduce((sum, t) => sum + t.count, 0)).toBe(adrs.length);
  });
});
