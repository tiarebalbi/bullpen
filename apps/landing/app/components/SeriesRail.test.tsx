import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeriesRail } from "./SeriesRail.js";

const parts = [{ part: 1, title: "Why distribute at all", status: "planned" as const, url: "", date: null, introduced: "One deployable" }];

describe("SeriesRail", () => {
  const markup = renderToStaticMarkup(<SeriesRail parts={parts} />);
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("says each part changes the architecture for a reason you can see, with a new data owner and no split database", () => {
    expect(text).toContain("a new service, a new data owner, an event where there used to be a call");
    expect(text).not.toMatch(/split database/i);
  });
});
