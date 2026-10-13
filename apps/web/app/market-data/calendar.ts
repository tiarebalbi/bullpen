/**
 * The U.S. stock market's trading days: weekends and the nine NYSE holidays
 * are not. Early closes do not matter here, only whether a day has an
 * end-of-day price. Computed from the holiday rules, so no year is listed by
 * hand; the tests pin 2026 and 2027 against the published schedule, and the
 * rules should be re-checked against it each January.
 */

const pad = (n: number): string => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

/** The nth (1-based) given weekday (0 = Sunday) of a month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = utc(y, m, 1).getUTCDay();
  return key(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(y: number, m: number, weekday: number): string {
  const last = utc(y, m + 1, 0);
  return key(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}

/** A fixed-date holiday: on a Saturday it is observed the Friday before, on a Sunday the Monday after (New Year's Day on a Saturday is not observed at all). */
function observed(y: number, m: number, d: number, saturdayIsObserved = true): string | null {
  const day = utc(y, m, d).getUTCDay();
  if (day === 6) return saturdayIsObserved ? key(y, m, d - 1) : null;
  if (day === 0) return key(y, m, d + 1);
  return key(y, m, d);
}

/** Western Easter Sunday (the anonymous Gregorian algorithm). */
function easter(y: number): { m: number; d: number } {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * (b % 4) + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

function goodFriday(y: number): string {
  const { m, d } = easter(y);
  const date = utc(y, m, d);
  date.setUTCDate(date.getUTCDate() - 2);
  return key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The dates (YYYY-MM-DD) the market is closed on a weekday, in `year`. */
export function marketHolidays(year: number): string[] {
  return [
    observed(year, 1, 1, false),
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Washington's Birthday
    goodFriday(year),
    lastWeekday(year, 5, 1), // Memorial Day
    observed(year, 6, 19), // Juneteenth
    observed(year, 7, 4), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observed(year, 12, 25),
  ].filter((date): date is string => date !== null).sort();
}

/** `date` is YYYY-MM-DD, a calendar date in New York. */
export function isTradingDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const weekday = utc(y, m, d).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !marketHolidays(y).includes(date);
}

export function nextTradingDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = utc(y, m, d);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (!isTradingDay(key(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())));
  return key(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** The calendar date in New York at `instant`. */
export function newYorkDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  return parts;
}

/** The last instant of a New York calendar date, as a UTC instant (the offset is EDT or EST for that date). */
export function endOfNewYorkDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d + 1, offsetHours, 0, 0) - 1000);
    if (newYorkDate(candidate) === date && newYorkDate(new Date(candidate.getTime() + 1000)) !== date) return candidate;
  }
  throw new Error(`no end of day found for ${date}`);
}

/**
 * When a stock price as of `asOf` stops being current: the end of the next
 * trading day, by which time that day's ingest has had its chance to replace
 * it. A Friday close is therefore current through Monday, and through
 * Tuesday after a Monday holiday.
 */
export function stockValidUntil(asOf: string): Date {
  return endOfNewYorkDay(nextTradingDay(asOf));
}

/** 16:00 in New York on a calendar date, as a UTC instant: the as-of time of that day's closing price. */
export function closeOfNewYorkDay(date: string): Date {
  const eightHoursBeforeMidnight = (7 * 3600 + 59 * 60 + 59) * 1000;
  return new Date(endOfNewYorkDay(date).getTime() - eightHoursBeforeMidnight);
}
