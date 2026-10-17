import { validateJsonLd } from "@bullpen/contracts";
import type { SeriesPart } from "../../lib/series.js";
import { PRIVACY_UPDATED } from "./contentDates.js";
import { PRODUCTION_HOST } from "./productionHost.js";

export type JsonLdPage = "home" | "architecture" | "privacy";

const ORIGIN = `https://${PRODUCTION_HOST}`;
const REPO = "https://github.com/tiarebalbi/bullpen";
const SERIES_ID = `${ORIGIN}/#series`;
const SOURCE_ID = `${ORIGIN}/#source`;

// The footer links no profile, so sameAs is the repo owner's GitHub alone.
// Add a profile here only once the site itself links it.
const AUTHOR = {
  "@type": "Person",
  name: "Tiarê Balbi Bonamini",
  url: "https://tiarebalbi.com",
  sameAs: ["https://github.com/tiarebalbi"],
};

/**
 * The page's JSON-LD graph.
 *
 * - home: WebSite + CreativeWorkSeries + SoftwareSourceCode.
 * - architecture: a WebPage about Bullpen, part of the series.
 * - privacy: a plain WebPage; it is not part of the series.
 *
 * `hasPart` lists the posts of the series that are published, each with its
 * `headline` (falling back to the card `title`), its URL and the date it went
 * live, all read from content/series.json -- a part that is not published has
 * no post to link, so it is not listed, and with none published there is no
 * `hasPart` at all.
 *
 * No series URL: tiarebalbi.com/en/series/architecting-software-in-2026 404s
 * today (the series page isn't public yet), and this isn't the place to link
 * a URL that doesn't resolve.
 *
 * No `license` on the source code: the repo declares none, and none is invented.
 */
export function buildJsonLd(page: JsonLdPage, parts: SeriesPart[]): object {
  const graph = { "@context": "https://schema.org", "@graph": nodesFor(page, parts) };

  if (page === "home") {
    const result = validateJsonLd(graph);
    if (!result.valid) throw new Error(`JsonLd: built an invalid JSON-LD graph:\n${result.errors}`);
  }
  return graph;
}

function nodesFor(page: JsonLdPage, parts: SeriesPart[]): object[] {
  if (page === "home") {
    return [
      { "@type": "WebSite", "@id": `${ORIGIN}/#website`, name: "Bullpen", url: `${ORIGIN}/` },
      seriesNode(parts),
      sourceNode(),
    ];
  }
  if (page === "architecture") {
    return [
      {
        "@type": "WebPage",
        "@id": `${ORIGIN}/architecture#webpage`,
        url: `${ORIGIN}/architecture`,
        name: "Bullpen architecture: services, flows, decisions and rules",
        inLanguage: "en",
        about: { "@type": "SoftwareSourceCode", "@id": SOURCE_ID, name: "Bullpen", codeRepository: REPO },
        isPartOf: { "@type": "CreativeWorkSeries", "@id": SERIES_ID, name: "Architecting Software in 2026" },
        author: AUTHOR,
      },
    ];
  }
  return [
    {
      "@type": "WebPage",
      "@id": `${ORIGIN}/privacy#webpage`,
      url: `${ORIGIN}/privacy`,
      name: "Privacy: what Bullpen collects, and why",
      inLanguage: "en",
      dateModified: PRIVACY_UPDATED,
    },
  ];
}

function seriesNode(parts: SeriesPart[]): object {
  const published = parts
    // A post with no date yet (the publish placeholder) is not listed: a BlogPosting needs the day it was published.
    .filter((part) => part.status === "published" && part.date !== null)
    .sort((a, b) => a.part - b.part)
    .map((part) => ({
      "@type": "BlogPosting",
      headline: part.headline ?? part.title,
      url: part.url,
      datePublished: part.date,
    }));
  return {
    "@type": "CreativeWorkSeries",
    "@id": SERIES_ID,
    name: "Architecting Software in 2026",
    inLanguage: "en",
    ...(published.length > 0 ? { hasPart: published } : {}),
    author: AUTHOR,
  };
}

function sourceNode(): object {
  return {
    "@type": "SoftwareSourceCode",
    "@id": SOURCE_ID,
    name: "Bullpen",
    codeRepository: REPO,
    programmingLanguage: "TypeScript",
    author: AUTHOR,
  };
}
