import type { ReactNode } from "react";
import type { SeriesPart } from "../../lib/series.js";
import { buildJsonLd } from "../lib/jsonLd.js";

/** The page's JSON-LD (see `buildJsonLd`) in a script tag. */
export function JsonLd({ parts }: { parts: SeriesPart[] }): ReactNode {
  const graph = buildJsonLd(parts);
  // Escaping "<" (as its unicode escape) prevents a "</script>" appearing
  // inside a string value from breaking out of this script tag.
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
