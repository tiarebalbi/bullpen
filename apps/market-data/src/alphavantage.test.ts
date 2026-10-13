import { describe, expect, it } from "vitest";
import { ProviderError, fetchGlobalQuote, globalQuoteUrl, parseGlobalQuote } from "./alphavantage.js";

// These payloads have the shape the provider documents for GLOBAL_QUOTE and for a refusal. They are not
// recorded responses: src/__fixtures__/alphavantage/ holds those once they are recorded, and
// fixtures.test.ts replays them. The values here are arbitrary.
const documented = (symbol: string, price: string, day: string) => ({
  "Global Quote": { "01. symbol": symbol, "05. price": price, "07. latest trading day": day },
});

describe("parseGlobalQuote", () => {
  it("reads the price as a string and the latest trading day", () => {
    expect(parseGlobalQuote("AAPL", documented("AAPL", "190.1200", "2026-10-13"))).toEqual({ symbol: "AAPL", price: "190.1200", latestTradingDay: "2026-10-13" });
  });

  it("treats a rate-limit message as a refusal, never as a price", () => {
    for (const key of ["Note", "Information"]) {
      expect(() => parseGlobalQuote("AAPL", { [key]: "You have reached the daily limit." })).toThrow(ProviderError);
      expect(() => parseGlobalQuote("AAPL", { [key]: "You have reached the daily limit." })).toThrow(/the provider refused/);
    }
  });

  it("rejects an empty Global Quote, the wrong symbol, and a price that is not a number", () => {
    expect(() => parseGlobalQuote("AAPL", { "Global Quote": {} })).toThrow(/no usable Global Quote/);
    expect(() => parseGlobalQuote("AAPL", documented("MSFT", "1", "2026-10-13"))).toThrow(/no usable Global Quote/);
    expect(() => parseGlobalQuote("AAPL", documented("AAPL", "N/A", "2026-10-13"))).toThrow(/no usable Global Quote/);
    expect(() => parseGlobalQuote("AAPL", documented("AAPL", "1", "13/10/2026"))).toThrow(/no usable Global Quote/);
    expect(() => parseGlobalQuote("AAPL", null)).toThrow(ProviderError);
  });
});

describe("fetchGlobalQuote", () => {
  it("asks for one symbol with GLOBAL_QUOTE and url-encodes both the symbol and the key", async () => {
    const urls: string[] = [];
    await fetchGlobalQuote("BRK.B", "k e/y", async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => documented("BRK.B", "1", "2026-10-13") };
    });
    expect(urls[0]).toBe("https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=BRK.B&apikey=k%20e%2Fy");
    expect(globalQuoteUrl("AAPL", "x")).toContain("function=GLOBAL_QUOTE");
  });

  it("fails on a non-200 status with the status in the message", async () => {
    await expect(fetchGlobalQuote("AAPL", "x", async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow("AAPL: the provider answered 503");
  });
});
