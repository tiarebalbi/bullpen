import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentPartFromTimeline, partTagFromTimeline } from "@bullpen/ui/analytics-config";

/** The timeline's current part, so the Clarity `part` tag moves when the timeline does. */
export function loadCurrentPart(repoRoot: string): number | null {
  return currentPartFromTimeline(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8"));
}

/** What the Clarity `part` tag says: the current part as text ("4"), or "bonus" while a bonus moment is the current one. Read at build: every landing route is static. */
export function loadPartTag(repoRoot: string): string | null {
  return partTagFromTimeline(JSON.parse(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8")));
}
