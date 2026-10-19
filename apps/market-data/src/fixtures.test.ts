import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGlobalQuote } from "./alphavantage.js";

const directory = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "alphavantage");
const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")) : [];

// Replays the responses `pnpm record:fixtures` recorded from the real provider. Until they are recorded this
// has nothing to replay, and the suite below is skipped rather than invented.
describe.skipIf(files.length === 0)("recorded Alpha Vantage responses", () => {
  for (const file of files) {
    it(`${file} parses into a price and a trading day`, () => {
      const fixture = JSON.parse(readFileSync(join(directory, file), "utf8")) as { request: { symbol: string }; response: unknown };
      const quote = parseGlobalQuote(fixture.request.symbol, fixture.response);
      expect(quote.price).toMatch(/^\d+(\.\d+)?$/);
      expect(quote.latestTradingDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  }
});
