import generated from "../../.generated/part-tag.json";

/**
 * What the Clarity `part` tag says: the timeline's current moment as a part number ("4"), or "bonus" while a bonus moment is the current one.
 *
 * It is a value written at build time (`pnpm run part-tag`, from the timeline), imported and so bundled into the server code. A dynamic route (`/account`,
 * `/admin/handles`) renders the root layout on every request, in a function whose disk has no `architecture/` folder: reading the timeline there, as this
 * module once did, returned a 500 (ENOENT) while the static pages, rendered at build, hid it.
 */
export const currentPartTag: string | null = generated.tag;
