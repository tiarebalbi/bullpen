import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The moment the timeline calls current: the one `current-moment` names, and whether it is a bonus moment (ADR-0027) rather than a numbered part. */
export interface CurrentMoment {
  id: string;
  bonus: boolean;
}

/**
 * The timeline's `current-moment`, from its text (so a test can give it any timeline). A bonus moment is told by its own `metadata.kind`, not by its id: nothing here names
 * "bonus-handles". Null when the text is not a timeline, or names no moment.
 */
export function currentMomentFromTimeline(timelineJson: string): CurrentMoment | null {
  try {
    const timeline = JSON.parse(timelineJson) as { "current-moment"?: unknown; moments?: Array<{ "unique-id"?: unknown; metadata?: { kind?: unknown } }> };
    const id = timeline["current-moment"];
    if (typeof id !== "string" || id.length === 0) return null;
    const moment = timeline.moments?.find((m) => m["unique-id"] === id);
    return { id, bonus: moment?.metadata?.kind === "bonus" };
  } catch {
    return null;
  }
}

/** The repo's own timeline, the same file `loadCurrentPart` reads for the Clarity `part` tag. */
export function loadCurrentMoment(repoRoot: string): CurrentMoment | null {
  return currentMomentFromTimeline(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8"));
}

/**
 * Whether the explorer opens with the bonus selected: the timeline's current moment is a bonus, and the bonus is built (published). When a later part is published,
 * `current-moment` moves to it, this turns false, and the page opens on that part again.
 */
export function opensOnBonus(current: CurrentMoment | null, bonus: { status: string } | null): boolean {
  return current !== null && current.bonus && bonus !== null && bonus.status === "built";
}
