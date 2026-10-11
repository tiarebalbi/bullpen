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
