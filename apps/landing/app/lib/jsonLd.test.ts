import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateJsonLd } from "@bullpen/contracts";
import { describe, expect, it } from "vitest";
import { parseSeries, type SeriesPart } from "../../lib/series.js";
import { buildJsonLd } from "./jsonLd.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const real = parseSeries(readFileSync(join(repoRoot, "content", "series.json"), "utf8"));

type Node = Record<string, unknown>;
type Graph = { "@graph": Node[] };
const nodes = (page: Parameters<typeof buildJsonLd>[0], parts: SeriesPart[]) => (buildJsonLd(page, parts) as Graph)["@graph"];
const types = (page: Parameters<typeof buildJsonLd>[0], parts: SeriesPart[]) => nodes(page, parts).map((node) => node["@type"]);
const seriesNode = (parts: SeriesPart[]) => nodes("home", parts).find((node) => node["@type"] === "CreativeWorkSeries")!;

const part = (n: number, status: SeriesPart["status"], headline?: string): SeriesPart => ({
  part: n,
  title: `Part ${n} title`,
  ...(headline === undefined ? {} : { headline }),
  status,
  url: status === "published" ? `https://tiarebalbi.com/en/blog/part-${n}` : "",
  introduced: "X",
  date: status === "published" ? `2026-10-0${n}` : null,
});

describe("buildJsonLd: home", () => {
  it("is a WebSite, a CreativeWorkSeries and the SoftwareSourceCode, and validates", () => {
    expect(types("home", real)).toEqual(["WebSite", "CreativeWorkSeries", "SoftwareSourceCode"]);
    expect(validateJsonLd(buildJsonLd("home", real)).valid).toBe(true);
  });

  it("lists Parts 1 and 2 with each post's real headline, URL and date", () => {
    expect(seriesNode(real).hasPart).toEqual([
      {
        "@type": "BlogPosting",
        headline: "When to Use Microservices in 2026: Scaling Alone Is No Longer the Reason",
        url: "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026",
        datePublished: "2026-10-04",
      },
      {
        "@type": "BlogPosting",
        headline: "Architecture as Code Has Three Jobs: Describe, Govern, Remember",
        url: "https://tiarebalbi.com/en/blog/architecture-as-code-describe-govern-remember",
        datePublished: "2026-10-11",
      },
    ]);
  });

  it("falls back to the short title when a part has no headline", () => {
    const parts = [part(1, "published", "The real headline"), part(2, "published")];
    expect((seriesNode(parts).hasPart as Array<{ headline: string }>).map((p) => p.headline)).toEqual(["The real headline", "Part 2 title"]);
  });

  it("lists a part only once it is published, in part order, and not the next one or the planned ones", () => {
    const parts = [part(2, "published"), part(1, "published"), part(3, "next"), part(4, "planned")];
    expect((seriesNode(parts).hasPart as Array<{ headline: string }>).map((p) => p.headline)).toEqual(["Part 1 title", "Part 2 title"]);
  });

  it("leaves hasPart out altogether when nothing is published, and the graph still validates", () => {
    const parts = [part(1, "next"), part(2, "planned")];
    expect(seriesNode(parts)).not.toHaveProperty("hasPart");
    expect(validateJsonLd(buildJsonLd("home", parts)).valid).toBe(true);
  });

  it("describes the code with its repository and language, and claims no license the repo does not declare", () => {
    const source = nodes("home", real).find((node) => node["@type"] === "SoftwareSourceCode")!;
    expect(source).toMatchObject({ codeRepository: "https://github.com/tiarebalbi/bullpen", programmingLanguage: "TypeScript" });
    expect(source).not.toHaveProperty("license");
  });

  it("names the author with the profiles the site itself links, and still links no series page that does not resolve", () => {
    expect(seriesNode(real)).toMatchObject({
      name: "Architecting Software in 2026",
      inLanguage: "en",
      author: { "@type": "Person", name: "Tiarê Balbi Bonamini", url: "https://tiarebalbi.com", sameAs: ["https://github.com/tiarebalbi"] },
    });
    expect(seriesNode(real)).not.toHaveProperty("url");
  });
});

describe("buildJsonLd: the other pages", () => {
  it("/architecture is a WebPage about Bullpen that is part of the series", () => {
    expect(types("architecture", real)).toEqual(["WebPage"]);
    const [page] = nodes("architecture", real);
    expect(page).toMatchObject({
      about: { "@type": "SoftwareSourceCode", name: "Bullpen" },
      isPartOf: { "@type": "CreativeWorkSeries", name: "Architecting Software in 2026" },
    });
  });

  it("/privacy is a plain WebPage, with no series", () => {
    expect(types("privacy", real)).toEqual(["WebPage"]);
    expect(JSON.stringify(buildJsonLd("privacy", real))).not.toContain("CreativeWorkSeries");
  });
});
