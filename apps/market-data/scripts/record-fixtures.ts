// Records real Alpha Vantage GLOBAL_QUOTE responses once, as test fixtures. CI replays them and never calls the provider.
//
//   ALPHA_VANTAGE_API_KEY=<key> pnpm --filter @bullpen/market-data record:fixtures [-- --max 10]
//
// One request per symbol, 12 seconds apart, never more than --max (default and ceiling: 10) of the provider's 25
// a day. The key is read from the environment and written nowhere: a fixture holds the response and what was asked.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { globalQuoteUrl } from "../src/alphavantage.ts";
import { STOCK_SYMBOLS } from "../src/symbols.ts";

const key = process.env.ALPHA_VANTAGE_API_KEY;
if (!key) {
  console.error("record-fixtures: set ALPHA_VANTAGE_API_KEY in your environment.");
  process.exit(1);
}
const maxIndex = process.argv.indexOf("--max");
const max = Math.min(10, maxIndex === -1 ? 10 : Number(process.argv[maxIndex + 1]));
const symbols = STOCK_SYMBOLS.slice(0, max);
const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "__fixtures__", "alphavantage");
mkdirSync(directory, { recursive: true });

for (const [index, symbol] of symbols.entries()) {
  const response = await fetch(globalQuoteUrl(symbol, key));
  const body: unknown = await response.json();
  const fixture = { recordedAt: new Date().toISOString(), request: { function: "GLOBAL_QUOTE", symbol }, status: response.status, response: body };
  writeFileSync(join(directory, `GLOBAL_QUOTE-${symbol}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`recorded ${symbol}: status ${response.status}, keys ${Object.keys(body as object).join(", ")}`);
  if (index < symbols.length - 1) await new Promise((resolve) => setTimeout(resolve, 12_000));
}
