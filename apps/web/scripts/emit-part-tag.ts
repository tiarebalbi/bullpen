// Writes apps/web/.generated/part-tag.json from architecture/calm/bullpen.timeline.json, at build time. See app/lib/emitPartTag.ts.
import { join } from "node:path";
import { emitPartTag } from "../app/lib/emitPartTag.js";

const web = join(import.meta.dirname, "..");
const tag = emitPartTag(join(web, "..", ".."), join(web, ".generated", "part-tag.json"));
console.log(`part tag: ${tag ?? "(none)"}`);
