import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateJsonLd } from "@bullpen/contracts";
import { describe, expect, it } from "vitest";
import { parseSeries, type SeriesPart } from "../../lib/series.js";
import { buildJsonLd } from "./jsonLd.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const real = parseSeries(readFileSync(join(repoRoot, "content", "series.json"), "utf8"));

type Graph = { "@graph": Array<Record<string, unknown>> };
const seriesNode = (parts: SeriesPart[]) => (buildJsonLd(parts) as Graph)["@graph"].find((node) => node["@type"] === "CreativeWorkSeries")!;

const part = (n: number, status: SeriesPart["status"]): SeriesPart => ({
  part: n,
  title: `Part ${n} title`,
  status,
  url: status === "published" ? `https://tiarebalbi.com/en/blog/part-${n}` : "",
  introduced: "X",
  date: status === "published" ? `2026-10-0${n}` : null,
});

describe("buildJsonLd", () => {
  it("lists exactly two parts, Parts 1 and 2, for the series as it is published today, and validates", () => {
    const graph = buildJsonLd(real);
    expect(validateJsonLd(graph).valid).toBe(true);
    expect(seriesNode(real).hasPart).toEqual([
      {
        "@type": "BlogPosting",
        headline: "Why distribute at all",
        url: "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026",
        datePublished: "2026-10-04",
      },
      {
        "@type": "BlogPosting",
        headline: "Architecture as code",
        url: "https://tiarebalbi.com/en/blog/architecture-as-code-describe-govern-remember",
        datePublished: "2026-10-11",
      },
    ]);
  });

  it("lists a part only once it is published, in part order, and not the next one or the planned ones", () => {
    const parts = [part(2, "published"), part(1, "published"), part(3, "next"), part(4, "planned")];
    expect((seriesNode(parts).hasPart as Array<{ headline: string }>).map((p) => p.headline)).toEqual(["Part 1 title", "Part 2 title"]);
  });

  it("leaves hasPart out altogether when nothing is published, and the graph still validates", () => {
    const parts = [part(1, "next"), part(2, "planned")];
    expect(seriesNode(parts)).not.toHaveProperty("hasPart");
    expect(validateJsonLd(buildJsonLd(parts)).valid).toBe(true);
  });

  it("keeps the WebSite and the author, and still links no series page that does not resolve", () => {
    const graph = buildJsonLd(real) as Graph;
    expect(graph["@graph"].map((node) => node["@type"])).toEqual(["WebSite", "CreativeWorkSeries"]);
    expect(seriesNode(real)).toMatchObject({ name: "Architecting Software in 2026", inLanguage: "en", author: { "@type": "Person", name: "Tiarê Balbi" } });
    expect(seriesNode(real)).not.toHaveProperty("url");
  });
});
