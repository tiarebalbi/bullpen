import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { PRODUCTION_HOST, isProductionHost } from "./lib/productionHost.js";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  if (!isProductionHost(host)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `https://${PRODUCTION_HOST}/sitemap.xml`,
  };
}
