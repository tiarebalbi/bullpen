import { readFileSync } from "node:fs";

export type SeriesStatus = "next" | "planned";

export interface SeriesPart {
  part: number;
  title: string;
  status: SeriesStatus;
  url: string;
}

const VALID_STATUS = new Set<string>(["next", "planned"]);

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
  const { part, title, status, url } = entry as Record<string, unknown>;

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
      `${sourceLabel}: entry ${index} (part ${part}) has an invalid "status" (expected "next" or "planned", got ${JSON.stringify(status)})`,
    );
  }
  if (typeof url !== "string") {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) is missing a "url" string`);
  }

  return { part, title, status: status as SeriesStatus, url };
}

export function loadSeries(filePath: string): SeriesPart[] {
  return parseSeries(readFileSync(filePath, "utf8"), filePath);
}
