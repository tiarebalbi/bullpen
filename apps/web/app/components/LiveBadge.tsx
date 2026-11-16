import type { ReactNode } from "react";
import { ConnectionIndicator, useNow } from "@bullpen/ui";
import { formatOpen, isMarketOpen, nextMarketOpen } from "@bullpen/contracts";
import type { LinkState } from "../lib/trading/priceLink.js";

/** "4s ago", "2 min ago": how old the last thing the feed said is. */
export function ageText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

/**
 * What the design system's indicator says beside its state's word. Freshness first, in the design's own vocabulary (Bullpen Terminal: `closed · Mon 9:30 ET`,
 * `live · 0.4s`): "Every number shows how fresh it is; stale, delayed and reconnecting data is always labeled." A closed market says when it opens; a feed that is
 * reconnecting says the prices on screen are the last received.
 */
export function liveDetail(link: LinkState, now: Date): string {
  if (link.status === "reconnecting") return link.snapshot ? "last prices kept" : "connecting";
  if (!isMarketOpen(now)) return `closed · ${formatOpen(nextMarketOpen(now))}`;
  if (link.status === "stale") return "past its close";
  return link.lastFrameAt === null ? "live" : ageText(now.getTime() - link.lastFrameAt);
}

/** The price feed's state in the design system's own indicator: Live, Reconnecting or Stale, each with its own glyph and words (never colour alone). */
export function LiveBadge({ link, now }: { link: LinkState; now?: Date }): ReactNode {
  const at = useNow(now?.getTime());
  return <ConnectionIndicator status={link.status} detail={liveDetail(link, new Date(at))} />;
}
