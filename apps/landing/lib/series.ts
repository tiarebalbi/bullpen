import { readFileSync } from "node:fs";

export type SeriesStatus = "published" | "next" | "planned";

/** The bonus is a detour between two parts: it has no part number, and links to its timeline moment (and so its explorer content) by `moment`. */
export type SeriesKind = "part" | "bonus";

export interface SeriesPart {
  /** "part" unless the entry says otherwise; the numbered parts of the series. */
  kind: "part";
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
  /**
   * When the post is planned to go out, ISO (YYYY-MM-DD), or absent. Only an unpublished entry has one, and it is never a publish date: the card shows it
   * as planned, and neither the JSON-LD nor the sitemap read it.
   */
  plannedDate?: string;
}

export interface SeriesBonus extends Omit<SeriesPart, "kind" | "part"> {
  kind: "bonus";
  /** The timeline moment id of the bonus, e.g. "bonus-handles". */
  moment: string;
}

/** One card in the series rail: a numbered part, or the bonus between two of them. */
export type SeriesEntry = SeriesPart | SeriesBonus;

export const isPart = (entry: SeriesEntry): entry is SeriesPart => entry.kind === "part";
export const isBonus = (entry: SeriesEntry): entry is SeriesBonus => entry.kind === "bonus";
/** The numbered parts, in order, for what only numbered parts have (the part scrubber, the explorer's tabs). */
export const partsOf = (series: readonly SeriesEntry[]): SeriesPart[] => series.filter(isPart);
/** "Part 3" or "the bonus": how an error or a label names an entry. */
export const nameOf = (entry: SeriesEntry): string => (isBonus(entry) ? "the bonus" : `part ${entry.part}`);

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
 * Parses `content/series.json` (the six-part series roadmap, and the bonus between Part 4 and Part 5) from its raw
 * text content. Throws a descriptive error for anything that isn't a valid
 * series entry, rather than silently rendering partial/garbage data.
 */
export function parseSeries(content: string, sourceLabel = "content/series.json"): SeriesEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (cause) {
    throw new Error(`${sourceLabel}: invalid JSON (${(cause as Error).message})`, { cause });
  }

  if (!Array.isArray(data)) {
    throw new Error(`${sourceLabel}: expected a JSON array of series parts`);
  }

  const entries = data.map((entry, index) => validateSeriesEntry(entry, index, sourceLabel));
  const next = entries.filter((entry) => entry.status === "next");
  if (next.length > 1) {
    throw new Error(`${sourceLabel}: ${next.map(nameOf).join(" and ")} are all "next" -- only one entry is next`);
  }
  const numbers = partsOf(entries).map((entry) => entry.part);
  if (numbers.some((number, at) => at > 0 && number <= numbers[at - 1]!)) {
    throw new Error(`${sourceLabel}: the numbered parts are not in increasing order (${numbers.join(", ")})`);
  }
  if (entries.filter(isBonus).length > 1) throw new Error(`${sourceLabel}: more than one bonus entry`);
  return entries;
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

/** The planned date, when there is one: a real YYYY-MM-DD on an entry that is not published (a published entry has its real `date`). */
function checkPlannedDate(plannedDate: unknown, date: string | null, status: string, where: string): string | undefined {
  if (plannedDate === undefined) return undefined;
  if (typeof plannedDate !== "string" || !DATE_PATTERN.test(plannedDate) || Number.isNaN(Date.parse(`${plannedDate}T00:00:00Z`))) {
    throw new Error(`${where} has an invalid "plannedDate" (expected "YYYY-MM-DD", got ${JSON.stringify(plannedDate)})`);
  }
  if (status === "published" || date !== null) throw new Error(`${where} has a "plannedDate" but is published -- a published entry has its real "date" and no planned one`);
  return plannedDate;
}

/** "bonus" or a part number: which kind of entry this is, with the fields only that kind has. */
function checkIdentity(entry: Record<string, unknown>, index: number, sourceLabel: string): { kind: "part"; part: number } | { kind: "bonus"; moment: string } {
  const { kind, part, moment } = entry;
  if (kind !== undefined && kind !== "part" && kind !== "bonus") throw new Error(`${sourceLabel}: entry ${index} has an invalid "kind" (expected "part" or "bonus", got ${JSON.stringify(kind)})`);
  if (kind === "bonus") {
    if (part !== undefined) throw new Error(`${sourceLabel}: entry ${index} is the bonus and has a "part" -- the bonus has no part number`);
    if (typeof moment !== "string" || !/^[a-z0-9-]+$/.test(moment)) {
      throw new Error(`${sourceLabel}: entry ${index} (the bonus) is missing a "moment" id naming its timeline moment, e.g. "bonus-handles"`);
    }
    return { kind: "bonus", moment };
  }
  if (typeof part !== "number" || !Number.isInteger(part) || part < 1 || part > 6) {
    throw new Error(`${sourceLabel}: entry ${index} has an invalid "part" (expected an integer 1-6, got ${JSON.stringify(part)})`);
  }
  if (moment !== undefined) throw new Error(`${sourceLabel}: entry ${index} (part ${part}) has a "moment" -- only the bonus names a moment`);
  return { kind: "part", part };
}

function validateSeriesEntry(entry: unknown, index: number, sourceLabel: string): SeriesEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`${sourceLabel}: entry ${index} is not an object`);
  }
  const { title, headline, status, url, introduced, date, plannedDate } = entry as Record<string, unknown>;
  const identity = checkIdentity(entry as Record<string, unknown>, index, sourceLabel);
  const part = identity.kind === "part" ? identity.part : "bonus";
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
  const where = `${sourceLabel}: entry ${index} (${identity.kind === "part" ? `part ${part}` : "the bonus"})`;
  const checkedDate = checkDate(date, url, status, where);
  const planned = checkPlannedDate(plannedDate, checkedDate, status, where);

  const shared = { title, ...(headline === undefined ? {} : { headline }), status: status as SeriesStatus, url, introduced, date: checkedDate, ...(planned === undefined ? {} : { plannedDate: planned }) };
  return identity.kind === "part" ? { kind: "part", part: identity.part, ...shared } : { kind: "bonus", moment: identity.moment, ...shared };
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

/**
 * "2026-11-23" as "Nov 23", the planned date's format: no year, because it is a plan and not a record. Read as midnight UTC and shown in UTC like
 * formatPublishDate. The bonus's card says "Planned · Nov 11" (`prefix`); the numbered parts show the date alone, set apart in the card.
 */
export function formatPlannedDate(iso: string, prefix = false): string {
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return prefix ? `Planned · ${day}` : day;
}

export function loadSeries(filePath: string): SeriesEntry[] {
  return parseSeries(readFileSync(filePath, "utf8"), filePath);
}
