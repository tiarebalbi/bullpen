import type { ChipTone } from "@bullpen/ui";

/** Maps an ADR's real "## Status" value to the design's chip color, defaulting anything unrecognized (e.g. "Draft") to neutral rather than guessing. */
export function statusTone(status: string): ChipTone {
  if (status === "Accepted") return "gain";
  if (status === "Proposed") return "accent";
  if (status === "Superseded") return "outline";
  return "neutral";
}

/** Superseded decisions get struck-through, muted row text (the design's "d.deco"/"d.fg" treatment). */
export function isSuperseded(status: string): boolean {
  return status === "Superseded";
}
