import { join } from "node:path";
import type { MetadataRoute } from "next";
import { loadSeries } from "../lib/series.js";
import { PRIVACY_UPDATED, latestPublishedDate } from "./lib/contentDates.js";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

// "/", "/architecture" and "/privacy" -- the nav's #series/#decisions/... links
// and the architecture page's tabs (#services, #flows, ...) are fragments of
// those pages, not separate URLs, so they don't belong in a sitemap.
//
// `lastmod` comes from content dates, never the build time, so two builds of
// the same content give the same sitemap: the latest published part for "/"
// and "/architecture", the privacy page's own date for "/privacy".
export default function sitemap(): MetadataRoute.Sitemap {
  const series = loadSeries(join(process.cwd(), "..", "..", "content", "series.json"));
  const latestPart = latestPublishedDate(series);
  const withDate = (path: string, date: string | null): MetadataRoute.Sitemap[number] => ({
    url: `https://${PRODUCTION_HOST}${path}`,
    ...(date === null ? {} : { lastModified: date }),
  });
  return [withDate("/", latestPart), withDate("/architecture", latestPart), withDate("/privacy", PRIVACY_UPDATED)];
}
