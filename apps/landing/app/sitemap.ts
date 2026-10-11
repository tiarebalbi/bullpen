import type { MetadataRoute } from "next";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

// "/", "/architecture" and "/privacy" -- the nav's #series/#decisions/... links
// and the architecture page's tabs (#services, #flows, ...) are fragments of
// those pages, not separate URLs, so they don't belong in a sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `https://${PRODUCTION_HOST}/`,
      lastModified: new Date(),
    },
    { url: `https://${PRODUCTION_HOST}/architecture`, lastModified },
    {
      url: `https://${PRODUCTION_HOST}/privacy`,
      // The date the page was last changed, not the build date.
      lastModified: new Date("2026-10-01T00:00:00Z"),
    },
  ];
}
