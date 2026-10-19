import { readFileSync } from "node:fs";

export type SeriesStatus = "published" | "next" | "planned";

export interface SeriesPart {
  part: number;
  title: string;
  /**
   * The post's real headline, when it differs from the short card `title`.
   * Optional: JSON-LD uses it for `hasPart` and falls back to `title`.
   */
  headline?: string;
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
 * What `date` holds in `content/series.json` between the publish commit and the day the post goes out. It is read as "no date yet":
 * the card shows no date and the JSON-LD names none, so an unamended merge publishes nothing false.
 */
export const PUBLISH_DATE_PLACEHOLDER = "PUBLISH_DATE_PLACEHOLDER";

// The design's series card has room for two lines of title and two lines
// of "Introduced" text before it breaks the card layout -- these budgets
// are measured from that card, not picked arbitrarily. Enforced here
// (not just eyeballed at write time) so a future edit that blows the
// budget fails loudly instead of quietly breaking the card.
export const TITLE_MAX_LENGTH = 28;
export const INTRODUCED_MAX_LENGTH = 60;

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

  const parts = data.map((entry, index) => validateSeriesEntry(entry, index, sourceLabel));
  const next = parts.filter((part) => part.status === "next");
  if (next.length > 1) {
    throw new Error(`${sourceLabel}: parts ${next.map((part) => part.part).join(" and ")} are all "next" -- only one part is next`);
  }
  return parts;
}

function checkHeadline(headline: unknown, where: string): asserts headline is string | undefined {
  if (headline !== undefined && (typeof headline !== "string" || headline.trim().length === 0)) {
    throw new Error(`${where} has an invalid "headline" (expected a non-empty string when present)`);
  }
}

/**
 * The entry's date, checked against its url and status: a real date (YYYY-MM-DD) or null, a published part has both url and date (or the
 * placeholder, read as no date yet), and an unpublished part has neither. Returns the date to keep: the placeholder becomes null.
 */
function checkDate(date: unknown, url: string, status: string, where: string): string | null {
  const placeholder = date === PUBLISH_DATE_PLACEHOLDER;
  if (placeholder && status !== "published") throw new Error(`${where} has the publish-date placeholder but is "${status}" -- only a published part can wait for its date`);
  if (!placeholder && date !== null && (typeof date !== "string" || !DATE_PATTERN.test(date))) {
    throw new Error(`${where} has an invalid "date" (expected null, "YYYY-MM-DD" or ${PUBLISH_DATE_PLACEHOLDER}, got ${JSON.stringify(date)})`);
  }
  if (url === "" && date !== null) throw new Error(`${where} has a "date" but no "url" -- unpublished parts must have both null/empty`);
  if (url !== "" && date === null) throw new Error(`${where} has a "url" but no "date" -- published parts must record when`);
  if (status === "published" && url === "") throw new Error(`${where} is "published" but has no "url" and "date" -- a published part links its post and says when`);
  if (status !== "published" && url !== "") throw new Error(`${where} is "${status}" but has a "url" and "date" -- only a published part has them`);
  return placeholder ? null : (date as string | null);
}

function validateSeriesEntry(entry: unknown, index: number, sourceLabel: string): SeriesPart {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`${sourceLabel}: entry ${index} is not an object`);
  }
  const { part, title, headline, status, url, introduced, date } = entry as Record<string, unknown>;

  if (typeof part !== "number" || !Number.isInteger(part) || part < 1 || part > 6) {
    throw new Error(
      `${sourceLabel}: entry ${index} has an invalid "part" (expected an integer 1-6, got ${JSON.stringify(part)})`,
    );
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error(`${sourceLabel}: entry ${index} (part ${part}) is missing a non-empty "title" string`);
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error(
      `${sourceLabel}: entry ${index} (part ${part}) has a "title" of ${title.length} characters, over the ${TITLE_MAX_LENGTH}-character card budget: ${JSON.stringify(title)}`,
    );
  }
  checkHeadline(headline, `${sourceLabel}: entry ${index} (part ${part})`);
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
  if (introduced.length > INTRODUCED_MAX_LENGTH) {
    throw new Error(
      `${sourceLabel}: entry ${index} (part ${part}) has an "introduced" line of ${introduced.length} characters, over the ${INTRODUCED_MAX_LENGTH}-character card budget: ${JSON.stringify(introduced)}`,
    );
  }
  const checkedDate = checkDate(date, url, status, `${sourceLabel}: entry ${index} (part ${part})`);

  return { part, title, ...(headline === undefined ? {} : { headline }), status: status as SeriesStatus, url, introduced, date: checkedDate };
}

/**
 * "2026-10-04" as "Oct 4, 2026", the card's date format. The date is a calendar
 * date, not a moment: it is read as midnight UTC and shown in UTC, so it is
 * the same day wherever the page is built or read. Formatted in the machine's
 * own time zone, it would show Oct 3 anywhere west of UTC.
 */
export function formatPublishDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function loadSeries(filePath: string): SeriesPart[] {
  return parseSeries(readFileSync(filePath, "utf8"), filePath);
}
