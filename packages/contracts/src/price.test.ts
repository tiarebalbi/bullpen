import { describe, expect, it } from "vitest";
import { validateCoinGeckoPrice, validatePriceSnapshot } from "./price.js";

describe("validateCoinGeckoPrice", () => {
  it("accepts a real CoinGecko /simple/price response for bitcoin", () => {
    const result = validateCoinGeckoPrice({
      bitcoin: { usd: 65432.1, usd_24h_change: 2.34, last_updated_at: 1758870000 },
    });
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it("rejects a malformed upstream payload with a clear error", () => {
    const malformed = { bitcoin: { usd: "a lot", usd_24h_change: 2.34 } };

    const result = validateCoinGeckoPrice(malformed);

    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
    expect(result.errors).toContain("last_updated_at");
  });

  it("rejects an empty object", () => {
    const result = validateCoinGeckoPrice({});
    expect(result.valid).toBe(false);
  });
});

describe("validatePriceSnapshot", () => {
  it("accepts a well-formed Bullpen price snapshot", () => {
    const result = validatePriceSnapshot({
      symbol: "BTC-USD",
      price: 65432.1,
      changePercent: 2.34,
      time: "2026-09-26T14:00:00.000Z",
      source: "coingecko",
      fetchedAt: "2026-09-26T14:00:01.234Z",
    });
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  it("rejects a snapshot from an unrecognized source", () => {
    const result = validatePriceSnapshot({
      symbol: "BTC-USD",
      price: 65432.1,
      changePercent: 2.34,
      time: "2026-09-26T14:00:00.000Z",
      source: "coinbase",
      fetchedAt: "2026-09-26T14:00:01.234Z",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("source");
  });

  it("rejects a snapshot with a non-ISO 8601 time", () => {
    const result = validatePriceSnapshot({
      symbol: "BTC-USD",
      price: 65432.1,
      changePercent: 2.34,
      time: "yesterday",
      source: "coingecko",
      fetchedAt: "2026-09-26T14:00:01.234Z",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a snapshot missing required fields", () => {
    const result = validatePriceSnapshot({ symbol: "BTC-USD" });
    expect(result.valid).toBe(false);
    expect(result.errors).not.toBeNull();
  });
});
