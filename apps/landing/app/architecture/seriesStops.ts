import type { ArchPartData } from "../components/ui.js";
import { latestBuiltPart } from "../components/ui.js";

/** The bonus's stop on the scrubber: a short branch off the main line, between the part it follows and the next one. */
export interface BonusStop {
  /** The part it follows (4): the branch leaves the line half a step after it. */
  after: number;
  /** What the node is called: "Change request". */
  title: string;
  /** Built (published) or planned, as a part's node is. */
  status: "built" | "planned";
}

/** Where on the line a stop sits: a part at its number, the bonus half a step after the part it follows. */
export const BONUS_OFFSET = 0.5;

export type StopState = "current" | "past" | "future";

/** A stop's state against the selected position, whether a part or the bonus (`position` is a part number, or the bonus's place between two). */
export const stateAt = (place: number, position: number): StopState => (place === position ? "current" : place < position ? "past" : "future");

/** The stops in reading order: the parts, with the bonus after the part it follows. */
export function stopsOf(parts: number, bonus: Pick<BonusStop, "after"> | undefined): number[] {
  return [...Array.from({ length: parts }, (_, i) => i + 1), ...(bonus ? [bonus.after + BONUS_OFFSET] : [])].sort((a, b) => a - b);
}

/** The next stop in `direction`, for the arrow keys and for Play: one step along the stops of `stopsOf`, held at either end. */
export function nextPosition(parts: number, position: number, bonus: Pick<BonusStop, "after"> | undefined, direction: 1 | -1): number {
  const stops = stopsOf(parts, bonus);
  const at = stops.indexOf(position);
  return stops[Math.min(stops.length - 1, Math.max(0, at + direction))]!;
}

/**
 * Where the page opens: on the bonus when the timeline's current moment is the built bonus (`opensOnBonus`, from `lib/currentMoment`), otherwise on the latest built part.
 * The same answer for the architecture page and the home page's explorer, which both start from it.
 */
export function openingPosition(parts: readonly ArchPartData[], bonus: ArchPartData | null, opensOnBonus: boolean): number {
  return opensOnBonus && bonus !== null && bonus.status === "built" ? bonus.part + BONUS_OFFSET : latestBuiltPart(parts);
}
