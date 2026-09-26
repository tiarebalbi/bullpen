import type { ReactNode } from "react";
import { validateJsonLd } from "@bullpen/contracts";
import { PRODUCTION_HOST } from "../lib/productionHost.js";

/**
 * WebSite + CreativeWorkSeries, per the content amendment's SEO section.
 * No hasPart: nothing in the series is published yet, so linking posts
 * would be inventing content that doesn't exist. No series URL either --
 * tiarebalbi.com/en/series/architecting-software-in-2026 404s today (the
 * series page isn't public yet, confirmed with a real request), and this
 * isn't the place to link a URL that doesn't resolve.
 */
export function buildJsonLd(): object {
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
    throw new Error(`JsonLd.tsx: built an invalid JSON-LD graph:\n${result.errors}`);
  }
  return graph;
}

export function JsonLd(): ReactNode {
  const graph = buildJsonLd();
  // Escaping "<" (as its unicode escape) prevents a "</script>" appearing
  // inside a string value from breaking out of this script tag.
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
