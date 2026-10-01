import { validateJsonLd } from "@bullpen/contracts";
import type { SeriesPart } from "../../lib/series.js";
import { PRODUCTION_HOST } from "./productionHost.js";

/**
 * WebSite + CreativeWorkSeries, per the content amendment's SEO section.
 *
 * `hasPart` lists the posts of the series that are published, each with its
 * headline, its URL and the date it went live, all read from
 * content/series.json -- a part that is not published has no post to link, so
 * it is not listed, and with none published there is no `hasPart` at all.
 *
 * No series URL either: tiarebalbi.com/en/series/architecting-software-in-2026
 * 404s today (the series page isn't public yet, confirmed with a real
 * request), and this isn't the place to link a URL that doesn't resolve.
 */
export function buildJsonLd(parts: SeriesPart[]): object {
  const published = parts
    .filter((part) => part.status === "published")
    .sort((a, b) => a.part - b.part)
    .map((part) => ({
      "@type": "BlogPosting",
      headline: part.title,
      url: part.url,
      datePublished: part.date,
    }));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Bullpen",
        url: `https://${PRODUCTION_HOST}/`,
      },
      {
        "@type": "CreativeWorkSeries",
        name: "Architecting Software in 2026",
        inLanguage: "en",
        ...(published.length > 0 ? { hasPart: published } : {}),
        author: {
          "@type": "Person",
          name: "Tiarê Balbi",
          url: "https://tiarebalbi.com",
        },
      },
    ],
  };

  const result = validateJsonLd(graph);
  if (!result.valid) {
    throw new Error(`JsonLd: built an invalid JSON-LD graph:\n${result.errors}`);
  }
  return graph;
}
