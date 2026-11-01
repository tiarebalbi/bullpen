import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseSeries } from "../../lib/series.js";
import { SeriesRail } from "./SeriesRail.js";

const parts = [{ kind: "part" as const, part: 1, title: "Why distribute at all", status: "planned" as const, url: "", date: null, introduced: "One deployable" }];
const real = parseSeries(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "series.json"), "utf8"));

describe("SeriesRail", () => {
  const markup = renderToStaticMarkup(<SeriesRail parts={parts} />);
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("says each part changes the architecture for a reason you can see, with a new data owner and no split database", () => {
    expect(text).toContain("a new service, a new data owner, an event where there used to be a call");
    expect(text).not.toMatch(/split database/i);
  });
});

describe("SeriesRail with the real series", () => {
  const markup = renderToStaticMarkup(<SeriesRail parts={real} />);
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const cards = markup.split("<li>").slice(1);

  it("is headed 'Six parts and a bonus, one system'", () => {
    expect(markup).toContain(">Six parts and a bonus, one system</h2>");
    expect(text).not.toContain("Six parts, one system");
  });

  it("has seven cards, with the bonus between Part 4 and Part 5", () => {
    expect(cards).toHaveLength(7);
    const labels = cards.map((card) => (card.includes('data-kind="bonus"') ? "bonus" : /Part (\d)/.exec(card)?.[1]));
    expect(labels).toEqual(["1", "2", "3", "4", "bonus", "5", "6"]);
  });

  it("shows the bonus as next with 'Planned · Nov 9' and the two parts after it as planned with their dates", () => {
    expect(cards[4]).toContain("Bonus · Detour");
    expect(cards[4]).toContain("Next");
    expect(cards[4]).toContain("Planned · Nov 9");
    expect(cards[4]).toContain('dateTime="2026-11-09"');
    expect(cards[5]).toContain("Planned for ");
    expect(cards[5]).toContain(">Nov 16<");
    expect(cards[6]).toContain(">Nov 23<");
    for (const card of cards.slice(5)) expect(card).not.toContain("Next");
  });

  it("shows a published date only for a published card, and no planned date on one", () => {
    for (const card of cards.slice(0, 4)) {
      expect(card).toContain("Published");
      expect(card).not.toContain("Planned");
    }
    expect(text).toContain("Oct 26, 2026");
    expect(text).not.toMatch(/Nov \d+, 2026/);
  });
});
