import type { ReactNode } from "react";
import { ConnectionIndicator } from "@bullpen/ui";
import type { LinkState } from "../lib/trading/priceLink.js";

/** What the design system's indicator says besides the state's word: how the prices are arriving, so Live by polling is not mistaken for Live by stream. */
export function liveDetail(link: LinkState): string {
  if (link.status === "reconnecting") return link.snapshot ? "showing the last prices" : "connecting";
  if (link.status === "stale") return "end of day";
  return link.via === "polling" ? "polling" : "stream";
}

/** The price feed's state in the design system's own indicator: Live, Reconnecting or Stale, each with its own glyph and words (never colour alone). */
export function LiveBadge({ link }: { link: LinkState }): ReactNode {
  return <ConnectionIndicator status={link.status} detail={liveDetail(link)} />;
}
