import { formatTime } from "@bullpen/ui";
import type { LinkState } from "./priceLink.js";

/** What the banner under the header says about the stock prices, or nothing while they flow. */
export interface MarketBanner {
  kind: "reconnecting" | "offline";
  title: string;
  text: string;
  /** Whole seconds until the next automatic try, or null when none is scheduled; offline only. */
  retryInSeconds: number | null;
}

/** Whole seconds from `now` until `at`, never below zero. */
export const secondsUntil = (at: number | null, now: number): number | null => (at === null ? null : Math.max(0, Math.ceil((at - now) / 1000)));

/**
 * The market-data banner (design: Bullpen Terminal and Mobile Trading, `banner`), from the price link:
 *   reconnecting after a failure, with prices on screen: the last prices stay, and an order is still priced from the latest stored close;
 *   offline, with nothing answered and no prices: orders are refused safely until the app answers.
 * None while the polling fallback works or the stream is switched off (that is "Delayed" in the indicator, not an alarm), and none for the stream's planned
 * close at four and a half minutes, which is not a failure (`attempt` is zero).
 * The design says prices "are frozen and labeled" and that "orders wait until quotes are live". Neither is true here: offline means there are no prices to freeze, and the
 * server prices an order from the stored close and refuses it when that close is stale, so the text says that.
 */
export function marketBanner(link: LinkState, now: number): MarketBanner | null {
  if (link.status === "offline") {
    return {
      kind: "offline",
      title: link.failed?.httpStatus === 503 ? "Prices are unavailable." : "You’re offline.",
      text: "No prices have arrived yet. New orders are refused safely until the app answers; nothing is reserved.",
      retryInSeconds: secondsUntil(link.nextRetryAt, now),
    };
  }
  if (link.status === "reconnecting" && link.snapshot !== null && link.attempt > 0) {
    return {
      kind: "reconnecting",
      title: "Reconnecting to market data.",
      text: `Prices shown are the last received${link.lastFrameAt === null ? "" : `, at ${formatTime(link.lastFrameAt)}`}. Orders still use the latest stored price.`,
      retryInSeconds: null,
    };
  }
  return null;
}
