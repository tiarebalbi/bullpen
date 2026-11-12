import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Players never trigger a provider call, and the number of viewers cannot change how many are made (ADR-0029, ADR-0013). The price stream reads stored prices
 * through the price contract and nothing else: no provider, no budget, no market-data service. The database also forbids it (the trading role has no right to
 * write market_data.provider_calls); this test is the check on the code that no one even tries.
 */
const roots = [join(__dirname), join(__dirname, "../../../api/prices"), join(__dirname, "../../../api/stock-prices")];
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });

const FORBIDDEN = [/reserveProviderCall/, /coingecko/i, /alpha.?vantage/i, /apps\/market-data/, /provider_calls/, /@bullpen\/db-market-data/, /fetch\(\s*["'`]https?:/];

describe("the price stream and the price routes", () => {
  const files = roots.flatMap(sources);

  it("find the source they are about", () => {
    expect(files.some((f) => f.endsWith("priceHub.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith(join("prices", "stream", "route.ts")))).toBe(true);
  });

  it.each(FORBIDDEN.map((pattern) => [String(pattern), pattern] as const))("never mention %s", (_name, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("read the database only through the price contract", () => {
    const hub = readFileSync(join(__dirname, "hub.ts"), "utf8");
    expect(hub).toContain("readPrices(readPool())");
    expect(hub).not.toMatch(/\.query\(/);
  });
});
