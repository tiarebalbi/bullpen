import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import type { LinkState } from "../lib/trading/priceLink.js";
import { LiveBadge, liveDetail } from "./LiveBadge.js";

beforeAll(() => {
  // jsdom has no matchMedia; the indicator reads it for reduced motion.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});

const snapshot: StockPriceSnapshot = { rows: [{ symbol: "AAPL", price: "100", asOf: "2026-11-12T21:00:00.000Z", stale: false, previousClose: null }] };
const link = (over: Partial<LinkState>): LinkState => ({ snapshot, status: "live", via: "stream", failed: false, ...over });

describe("the price feed's badge", () => {
  it.each([
    ["live", "Live"],
    ["reconnecting", "Reconnecting"],
    ["stale", "Stale"],
  ] as const)("says %s in words", (status, word) => {
    render(<LiveBadge link={link({ status })} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("tells a live stream from live polling, and says the last prices are kept while reconnecting", () => {
    expect(liveDetail(link({ via: "stream" }))).toBe("stream");
    expect(liveDetail(link({ via: "polling" }))).toBe("polling");
    expect(liveDetail(link({ status: "reconnecting" }))).toBe("showing the last prices");
    expect(liveDetail(link({ status: "reconnecting", snapshot: null, via: "none" }))).toBe("connecting");
  });
});
