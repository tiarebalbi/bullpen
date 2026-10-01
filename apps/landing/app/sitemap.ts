import type { MetadataRoute } from "next";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

// "/" and "/architecture". The nav's #series/#decisions/... links and the
// architecture page's tabs (#services, #flows, ...) are fragments of those
// two pages, not separate URLs, so they don't belong in a sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `https://${PRODUCTION_HOST}/`, lastModified },
    { url: `https://${PRODUCTION_HOST}/architecture`, lastModified },
  ];
}
