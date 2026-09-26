import { readFileSync } from "node:fs";

export type SeriesStatus = "published" | "next" | "planned";

export interface SeriesPart {
  part: number;
  title: string;
  status: SeriesStatus;
  url: string;
  /**
   * Short, real description of what this part's architecture record
   * introduces (distilled from architecture/calm/planned/part-0N.architecture.json
   * and the relevant ADRs) -- never the design export's sample copy.
   */
  introduced: string;
  /**
   * ISO date (YYYY-MM-DD) this part's post actually went live, or `null`
   * while it hasn't been published yet. Deliberately not the milestone due
   * date -- a "date" next to "See it" implies a real publish date, and a
   * future target date in that slot would misrepresent what's happened.
   */
  date: string | null;
}

const VALID_STATUS = new Set<string>(["published", "next", "planned"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses `content/series.json` (the six-part series roadmap) from its raw
 * text content. Throws a descriptive error for anything that isn't a valid
 * series entry, rather than silently rendering partial/garbage data.
 */
export function parseSeries(content: string, sourceLabel = "content/series.json"): SeriesPart[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (cause) {
    throw new Error(`${sourceLabel}: invalid JSON (${(cause as Error).message})`, { cause });
  }

  if (!Array.isArray(data)) {
    throw new Error(`${sourceLabel}: expected a JSON array of series parts`);
  }

  return data.map((entry, index) => validateSeriesEntry(entry, index, sourceLabel));
}

function validateSeriesEntry(entry: unknown, index: number, sourceLabel: string): SeriesPart {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`${sourceLabel}: entry ${index} is not an object`);
  }
  const { part, title, status, url, introduced, date } = entry as Record<string, unknown>;

  if (typeof part !== "number" || !Number.isInteger(part) || part < 1 || part > 6) {
    throw new Error(
      `${sourceLabel}: entry ${index} has an invalid "part" (expected an integer 1-6, got ${JSON.stringify(part)})`,
    );
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) is missing a non-empty "title" string`);
  }
  if (typeof status !== "string" || !VALID_STATUS.has(status)) {
    throw new Error(
      `${sourceLabel}: entry ${index} (part ${part}) has an invalid "status" (expected "published", "next" or "planned", got ${JSON.stringify(status)})`,
    );
  }
  if (typeof url !== "string") {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) is missing a "url" string`);
  }
  if (typeof introduced !== "string" || introduced.trim().length === 0) {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) is missing a non-empty "introduced" string`);
  }
  if (date !== null && (typeof date !== "string" || !DATE_PATTERN.test(date))) {
    throw new Error(
      `${sourceLabel}: entry ${index} (part ${part}) has an invalid "date" (expected null or "YYYY-MM-DD", got ${JSON.stringify(date)})`,
    );
  }
  if (url === "" && date !== null) {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) has a "date" but no "url" -- unpublished parts must have both null/empty`);
  }
  if (url !== "" && date === null) {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) has a "url" but no "date" -- published parts must record when`);
  }

  return { part, title, status: status as SeriesStatus, url, introduced, date: date as string | null };
}

export function loadSeries(filePath: string): SeriesPart[] {
  return parseSeries(readFileSync(filePath, "utf8"), filePath);
}
