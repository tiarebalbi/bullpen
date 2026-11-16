import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
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
const link = (over: Partial<LinkState>): LinkState => ({ snapshot, status: "live", via: "stream", lastFrameAt: OPEN_NOW.getTime() - 4000, failed: null, attempt: 0, nextRetryAt: null, streamPaused: false, ...over });

describe("the price feed's badge", () => {
  it.each([
    ["live", "Live"],
    ["reconnecting", "Reconnecting"],
    ["stale", "Stale"],
    ["delayed", "Delayed"],
    ["offline", "Offline"],
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

  it("says reconnecting by attempt once the stream has failed: stocks · attempt N of 3, never above 3", () => {
    expect(liveDetail(link({ status: "reconnecting", attempt: 1 }), OPEN_NOW)).toBe("stocks · attempt 1 of 3");
    expect(liveDetail(link({ status: "reconnecting", attempt: 2 }), OPEN_NOW)).toBe("stocks · attempt 2 of 3");
    expect(liveDetail(link({ status: "reconnecting", attempt: 7 }), OPEN_NOW)).toBe("stocks · attempt 3 of 3");
  });

  it("says a polling screen refreshes every 10 s, and that live prices are paused when the price-stream switch is off, even when the market is closed", () => {
    expect(liveDetail(link({ status: "delayed", via: "polling" }), OPEN_NOW)).toBe("refreshes every 10 s");
    expect(liveDetail(link({ status: "delayed", via: "polling", streamPaused: true }), OPEN_NOW)).toBe("live prices paused");
    expect(liveDetail(link({ status: "delayed", via: "polling", streamPaused: true }), SATURDAY)).toBe("live prices paused");
  });

  it("counts down to the next try when offline, and offers Retry now only then", () => {
    const retry = vi.fn();
    expect(liveDetail(link({ status: "offline", snapshot: null, via: "none", nextRetryAt: OPEN_NOW.getTime() + 7_200 }), OPEN_NOW)).toBe("retry in 8 s");
    expect(liveDetail(link({ status: "offline", snapshot: null, via: "none", nextRetryAt: OPEN_NOW.getTime() - 500 }), OPEN_NOW)).toBe("retry in 0 s");
    expect(liveDetail(link({ status: "offline", snapshot: null, via: "none" }), OPEN_NOW)).toBe("retrying");
    const { unmount } = render(<LiveBadge link={link({ status: "offline", snapshot: null, via: "none", nextRetryAt: OPEN_NOW.getTime() + 8_000 })} now={OPEN_NOW} onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(retry).toHaveBeenCalledTimes(1);
    unmount();
    render(<LiveBadge link={link({ status: "reconnecting", attempt: 1 })} now={OPEN_NOW} onRetry={retry} />);
    expect(screen.queryByRole("button", { name: "Retry now" })).toBeNull();
  });

  it("says a price past its close is that, and that the prices on screen are the last received while reconnecting", () => {
    expect(liveDetail(link({ status: "stale" }), OPEN_NOW)).toBe("past its close");
    expect(liveDetail(link({ status: "reconnecting" }), OPEN_NOW)).toBe("last prices kept");
    expect(liveDetail(link({ status: "reconnecting", snapshot: null, via: "none" }), OPEN_NOW)).toBe("connecting");
    expect(liveDetail(link({ status: "reconnecting" }), SATURDAY)).toBe("last prices kept"); // a lost connection is said even when the market is closed
  });
});
