import type { MetadataRoute } from "next";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

// "/" and "/privacy" -- the nav's #series/#architecture/... links are
// fragments on the home page, not separate URLs, so they don't belong here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `https://${PRODUCTION_HOST}/`,
      lastModified: new Date(),
    },
    {
      url: `https://${PRODUCTION_HOST}/privacy`,
      // The date the page was last changed, not the build date.
      lastModified: new Date("2026-10-01T00:00:00Z"),
    },
  ];
}
