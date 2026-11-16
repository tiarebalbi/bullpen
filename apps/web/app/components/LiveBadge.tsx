import type { ReactNode } from "react";
import { ConnectionIndicator, useNow } from "@bullpen/ui";
import { formatOpen, isMarketOpen, nextMarketOpen } from "@bullpen/contracts";
import { POLL_AFTER_FAILURES, POLL_MS, type LinkState } from "../lib/trading/priceLink.js";
import { secondsUntil } from "../lib/trading/marketBanner.js";

/** "4s ago", "2 min ago": how old the last thing the feed said is. */
export function ageText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

/**
 * What the design system's indicator says beside its state's word. Freshness first, in the design's own vocabulary (Bullpen Terminal: `closed · Mon 9:30 ET`,
 * `live · 0.4s`): "Every number shows how fresh it is; stale, delayed and reconnecting data is always labeled." Each state has its own words:
 *   reconnecting: `stocks · attempt N of 3` once the stream has failed (three failures send the screen to polling), else the prices on screen are the last received;
 *   delayed: the polling fallback, `refreshes every 10 s`, or `live prices paused` when the price-stream switch is off;
 *   offline: nothing has answered, `retry in N s`;
 *   a closed market says when it opens, and a stale price is past its close.
 */
/** The stream dropped: which attempt it is on once it has failed, else whether the screen still holds prices. */
function reconnectingDetail(link: LinkState): string {
  if (link.attempt > 0) return `stocks · attempt ${Math.min(link.attempt, POLL_AFTER_FAILURES)} of ${POLL_AFTER_FAILURES}`;
  return link.snapshot ? "last prices kept" : "connecting";
}

/** Nothing has answered: the seconds to the next automatic try, if one is scheduled. */
function offlineDetail(link: LinkState, now: Date): string {
  const seconds = secondsUntil(link.nextRetryAt, now.getTime());
  return seconds === null ? "retrying" : `retry in ${seconds} s`;
}

// metrics-gate: ignore[nesting] -- the counter reads each `${…}` in a template literal as a block; the function is a flat chain of guard returns, one per state.
export function liveDetail(link: LinkState, now: Date): string {
  if (link.status === "offline") return offlineDetail(link, now);
  if (link.status === "reconnecting") return reconnectingDetail(link);
  if (link.status === "delayed") return link.streamPaused ? "live prices paused" : `refreshes every ${POLL_MS / 1000} s`;
  if (!isMarketOpen(now)) return `closed · ${formatOpen(nextMarketOpen(now))}`;
  if (link.status === "stale") return "past its close";
  return link.lastFrameAt === null ? "live" : ageText(now.getTime() - link.lastFrameAt);
}

/** The price feed's state in the design system's own indicator: Live, Delayed, Reconnecting, Stale or Offline, each with its own glyph and words (never colour alone). Offline offers "Retry now". */
export function LiveBadge({ link, now, onRetry }: { link: LinkState; now?: Date; onRetry?: () => void }): ReactNode {
  const at = useNow(now?.getTime());
  return <ConnectionIndicator status={link.status} detail={liveDetail(link, new Date(at))} onRetry={link.status === "offline" ? onRetry : undefined} />;
}
