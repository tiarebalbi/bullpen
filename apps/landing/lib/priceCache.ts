import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = join("apps", "web", "app", "api", "price", "[symbol]", "route.ts");
const REVALIDATE = /export const REVALIDATE_SECONDS = (\d+);/;

/**
 * How long the price route caches an upstream CoinGecko answer, read from the
 * route's own `REVALIDATE_SECONDS` (the same constant the budget check models
 * call volume from), or null if it cannot be read. A page that says "cached
 * for 300 seconds" says it because the code says it.
 */
export function readPriceCacheSeconds(repoRoot: string): number | null {
  try {
    const match = REVALIDATE.exec(readFileSync(join(repoRoot, ROUTE), "utf8"));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
