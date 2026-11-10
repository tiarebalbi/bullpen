import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const contentDir = join(import.meta.dirname, "..", "..", "..", "content", "architecture");

interface PartContent {
  part: number;
  status: "built" | "planned";
}

/**
 * The part the explorers should open on, read straight from the explorer
 * content: the highest part whose status is "built". It names no part number,
 * so these specs keep holding when a part ships, and it never looks at the
 * timeline's current-moment, which is the record of what is published.
 */
export function expectedOpeningPart(): number {
  const built = readdirSync(contentDir)
    .filter((file) => /^part-\d+\.json$/.test(file))
    .map((file) => JSON.parse(readFileSync(join(contentDir, file), "utf8")) as PartContent)
    .filter((content) => content.status === "built")
    .map((content) => content.part);
  if (built.length === 0) throw new Error(`No part in ${contentDir} is built, so there is nothing to open on.`);
  return Math.max(...built);
}

export interface ExpectedOpening {
  /** The page opens with the bonus selected. */
  bonus: boolean;
  /** The part selected, or the part the bonus follows when `bonus` is true. */
  part: number;
}

/**
 * Where the explorers open, read from the timeline's `current-moment` (a bonus moment is told by `metadata.kind`, never by its id): on the bonus when the
 * current moment is a built bonus, otherwise on the latest built part.
 */
export function expectedOpening(): ExpectedOpening {
  const timeline = JSON.parse(readFileSync(join(contentDir, "..", "..", "architecture", "calm", "bullpen.timeline.json"), "utf8")) as {
    "current-moment": string;
    moments: { "unique-id": string; metadata?: { kind?: string; after?: string } }[];
  };
  const moment = timeline.moments.find((m) => m["unique-id"] === timeline["current-moment"]);
  const part = expectedOpeningPart();
  return moment?.metadata?.kind === "bonus" ? { bonus: true, part } : { bonus: false, part };
}
