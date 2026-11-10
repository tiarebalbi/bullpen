import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { partTagFromTimeline } from "@bullpen/ui/analytics-config";

/**
 * Build-time step (scripts/emit-part-tag.ts, run before `next build`, typecheck and tests): reads the timeline's current moment and writes the Clarity `part`
 * tag into `.generated/part-tag.json`, which the root layout imports. Nothing reads the repository's files at request time, where they are not on disk.
 * Run only from the repository, never by a route.
 */
export function emitPartTag(repoRoot: string, outFile: string): string | null {
  const timeline: unknown = JSON.parse(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8"));
  const tag = partTagFromTimeline(timeline);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify({ tag })}\n`);
  return tag;
}
