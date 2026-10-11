import type { ReactNode } from "react";
import type { SeriesPart } from "../../lib/series.js";
import { buildJsonLd, type JsonLdPage } from "../lib/jsonLd.js";

/** The page's JSON-LD (see `buildJsonLd`) in a script tag. */
export function JsonLd({ page, parts }: { page: JsonLdPage; parts: SeriesPart[] }): ReactNode {
  const graph = buildJsonLd(page, parts);
  // Escaping "<" (as its unicode escape) prevents a "</script>" appearing
  // inside a string value from breaking out of this script tag.
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
