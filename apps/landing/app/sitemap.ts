import type { MetadataRoute } from "next";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

// Only "/" -- the nav's #series/#architecture/... links are fragments on
// that one page, not separate URLs, so they don't belong in a sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `https://${PRODUCTION_HOST}/`,
      lastModified: new Date(),
    },
  ];
}
