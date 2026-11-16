import { describe, expect, it } from "vitest";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import { formatTime } from "@bullpen/ui";
import { marketBanner, secondsUntil } from "./marketBanner.js";
import type { LinkState } from "./priceLink.js";

const snapshot: StockPriceSnapshot = { rows: [{ symbol: "AAPL", price: "100", asOf: "2026-11-12T21:00:00.000Z", stale: false, previousClose: null }] };
const NOW = Date.parse("2026-11-12T16:00:00Z");
const link = (over: Partial<LinkState>): LinkState => ({ snapshot, status: "live", via: "stream", lastFrameAt: NOW - 12_000, failed: null, attempt: 0, nextRetryAt: null, streamPaused: false, ...over });

describe("the market-data banner", () => {
  it("is absent while prices flow on the stream, on the polling fallback, and when the stream is switched off", () => {
    expect(marketBanner(link({}), NOW)).toBeNull();
    expect(marketBanner(link({ status: "delayed", via: "polling" }), NOW)).toBeNull();
    expect(marketBanner(link({ status: "delayed", via: "polling", streamPaused: true }), NOW)).toBeNull();
    expect(marketBanner(link({ status: "stale" }), NOW)).toBeNull();
  });

  it("is absent for the stream's planned close, which is a reconnect and not a failure", () => {
    expect(marketBanner(link({ status: "reconnecting", attempt: 0 }), NOW)).toBeNull();
  });

  it("is absent while connecting for the first time, with no prices and nothing failed", () => {
    expect(marketBanner(link({ status: "reconnecting", snapshot: null, via: "none", lastFrameAt: null }), NOW)).toBeNull();
  });

  it("says the stream is reconnecting, shows when the prices on screen were last received, and says orders still use the stored price", () => {
    const banner = marketBanner(link({ status: "reconnecting", attempt: 1 }), NOW)!;
    expect(banner.kind).toBe("reconnecting");
    expect(banner.title).toBe("Reconnecting to market data.");
    expect(banner.text).toBe(`Prices shown are the last received, at ${formatTime(NOW - 12_000)}. Orders still use the latest stored price.`);
    expect(banner.retryInSeconds).toBeNull();
  });

  it("does not say orders wait for live quotes: the server prices an order from the stored close (data honesty)", () => {
    const text = marketBanner(link({ status: "reconnecting", attempt: 1 }), NOW)!.text + marketBanner(link({ status: "offline", snapshot: null, via: "none", failed: { httpStatus: null } }), NOW)!.text;
    expect(text).not.toMatch(/wait/i);
    expect(text).not.toMatch(/frozen/i); // offline means there are no prices to freeze
  });

  it("is offline when nothing has answered and there are no prices: orders refused safely, nothing reserved, and the seconds to the next try", () => {
    const banner = marketBanner(link({ status: "offline", snapshot: null, via: "none", lastFrameAt: null, failed: { httpStatus: null }, nextRetryAt: NOW + 7_300 }), NOW)!;
    expect(banner).toEqual({
      kind: "offline",
      title: "You’re offline.",
      text: "No prices have arrived yet. New orders are refused safely until the app answers; nothing is reserved.",
      retryInSeconds: 8,
    });
  });

  it("says the prices are unavailable, not that the player is offline, when the app answered 503", () => {
    const banner = marketBanner(link({ status: "offline", snapshot: null, via: "none", failed: { httpStatus: 503 } }), NOW)!;
    expect(banner.title).toBe("Prices are unavailable.");
    expect(banner.retryInSeconds).toBeNull();
  });

  it("counts whole seconds up, never below zero, and says nothing when no try is scheduled", () => {
    expect(secondsUntil(NOW + 1, NOW)).toBe(1);
    expect(secondsUntil(NOW + 10_000, NOW)).toBe(10);
    expect(secondsUntil(NOW - 5_000, NOW)).toBe(0);
    expect(secondsUntil(null, NOW)).toBeNull();
  });
});
