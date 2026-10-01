import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentPartFromTimeline } from "@bullpen/ui/analytics-config";

/** The timeline's current part, so the Clarity `part` tag moves when the timeline does. */
export function loadCurrentPart(repoRoot: string): number | null {
  return currentPartFromTimeline(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8"));
}
