import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import type { LinkState } from "../lib/trading/priceLink.js";
import { LiveBadge, ageText, liveDetail } from "./LiveBadge.js";

beforeAll(() => {
  // jsdom has no matchMedia; the indicator reads it for reduced motion.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});

const snapshot: StockPriceSnapshot = { rows: [{ symbol: "AAPL", price: "100", asOf: "2026-11-12T21:00:00.000Z", stale: false, previousClose: null }] };
const OPEN_NOW = new Date("2026-11-12T16:00:05Z"); // Thursday 11:00:05 ET
const SATURDAY = new Date("2026-11-14T15:00:00Z"); // closed until Monday 9:30 ET
const link = (over: Partial<LinkState>): LinkState => ({ snapshot, status: "live", via: "stream", lastFrameAt: OPEN_NOW.getTime() - 4000, failed: null, ...over });

describe("the price feed's badge", () => {
  it.each([
    ["live", "Live"],
    ["reconnecting", "Reconnecting"],
    ["stale", "Stale"],
  ] as const)("says %s in words", (status, word) => {
    render(<LiveBadge link={link({ status })} now={OPEN_NOW} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("says how fresh the feed is, first, as the design's own indicator does: live · 4s ago", () => {
    expect(liveDetail(link({}), OPEN_NOW)).toBe("4s ago");
    expect(liveDetail(link({ lastFrameAt: OPEN_NOW.getTime() - 130_000 }), OPEN_NOW)).toBe("2 min ago");
    expect(ageText(-5)).toBe("0s ago");
  });

  it("says when stocks open while the market is closed, as the terminal design does: closed · Mon 9:30 ET", () => {
    expect(liveDetail(link({}), SATURDAY)).toBe("closed · Mon 9:30 ET");
    expect(liveDetail(link({ status: "stale" }), SATURDAY)).toBe("closed · Mon 9:30 ET");
  });

  it("says a price past its close is that, and that the prices on screen are the last received while reconnecting", () => {
    expect(liveDetail(link({ status: "stale" }), OPEN_NOW)).toBe("past its close");
    expect(liveDetail(link({ status: "reconnecting" }), OPEN_NOW)).toBe("last prices kept");
    expect(liveDetail(link({ status: "reconnecting", snapshot: null, via: "none" }), OPEN_NOW)).toBe("connecting");
    expect(liveDetail(link({ status: "reconnecting" }), SATURDAY)).toBe("last prices kept"); // a lost connection is said even when the market is closed
  });
});
