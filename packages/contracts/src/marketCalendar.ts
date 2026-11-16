/**
 * The US stock market's calendar: regular hours 9:30-16:00 America/New_York, weekends, NYSE holidays and early closes.
 * Pure and dependency-free, so the trading library (to queue an order), the sweeper (to wake at the open) and the screens
 * (to say when an order will be released) all read the same answer. Bullpen's stock prices are end-of-day closes (ADR-0024);
 * this module only says when the market is open, it never makes a price.
 *
 * Source for the holiday and early-close lists: NYSE, "Holidays & Trading Hours",
 * https://www.nyse.com/trade/hours-calendars (read 2026-11-12), which lists 2026, 2027 and 2028.
 * The lists cover 2026-2027 only; outside that range only weekends are known, and `calendarCovers` says so.
 */

export const MARKET_TIME_ZONE = "America/New_York";
/** Minutes after midnight, New York time. */
export const OPEN_MINUTES = 9 * 60 + 30;
export const CLOSE_MINUTES = 16 * 60;
/** NYSE's early close, 1:00 p.m. */
export const EARLY_CLOSE_MINUTES = 13 * 60;

/** Full-day closures, as New York dates. A holiday on a Saturday is observed on the Friday, on a Sunday on the Monday (NYSE's own list below already says which). */
export const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King, Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth National Independence Day
  "2026-07-03", // Independence Day (observed; July 4 is a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
  // 2027
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King, Jr. Day
  "2027-02-15", // Washington's Birthday
  "2027-03-26", // Good Friday
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed; June 19 is a Saturday)
  "2027-07-05", // Independence Day (observed; July 4 is a Sunday)
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving Day
  "2027-12-24", // Christmas Day (observed; December 25 is a Saturday)
]);

/** Days the market closes at 1:00 p.m.: the day after Thanksgiving, and Christmas Eve in 2026. */
export const NYSE_EARLY_CLOSES: ReadonlySet<string> = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

export const CALENDAR_FIRST_DATE = "2026-01-01";
export const CALENDAR_LAST_DATE = "2027-12-31";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

export interface MarketParts {
  /** The New York date, `YYYY-MM-DD`. */
  date: string;
  /** Minutes after New York midnight. */
  minutes: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The New York wall-clock date and time of an instant. DST is the platform's: the 9:30 of a day is 9:30 in EST and in EDT. */
export function marketParts(at: Date): MarketParts {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]),
  };
}

/** True when the holiday and early-close lists say something about this date (2026-2027). Outside it only weekends are known. */
export const calendarCovers = (at: Date): boolean => {
  const { date } = marketParts(at);
  return date >= CALENDAR_FIRST_DATE && date <= CALENDAR_LAST_DATE;
};

const weekdayOfDate = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();

/** A New York date that is a weekday and not a holiday. */
export function isTradingDay(date: string): boolean {
  const weekday = weekdayOfDate(date);
  return weekday !== 0 && weekday !== 6 && !NYSE_HOLIDAYS.has(date);
}

/** The minute the regular session ends on a trading day: 16:00, or 13:00 on an early close. */
export const closeMinutesOn = (date: string): number => (NYSE_EARLY_CLOSES.has(date) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES);

/** Regular hours: a trading day, from 9:30 inclusive to the close exclusive. */
export function isMarketOpen(at: Date): boolean {
  const { date, minutes } = marketParts(at);
  return isTradingDay(date) && minutes >= OPEN_MINUTES && minutes < closeMinutesOn(date);
}

/** The instant a New York date and time of day occurs. The opening time never falls in the hour a clock change skips or repeats, so one of the two offsets always matches. */
export function marketInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, 0, minutes) + offsetHours * 3_600_000);
    const back = marketParts(candidate);
    if (back.date === date && back.minutes === minutes) return candidate;
  }
  throw new Error(`no instant for ${date} at minute ${minutes} in ${MARKET_TIME_ZONE}`);
}

const nextDate = (date: string): string => new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** The first 9:30 on a trading day strictly after `at`. At 9:30:00 exactly, that is the next trading day's. */
export function nextMarketOpen(at: Date): Date {
  let { date } = marketParts(at);
  for (let i = 0; i < 14; i += 1) {
    if (isTradingDay(date)) {
      const open = marketInstant(date, OPEN_MINUTES);
      if (open.getTime() > at.getTime()) return open;
    }
    date = nextDate(date);
  }
  throw new Error("no trading day within 14 days");
}

/** The most recent 9:30 on a trading day at or before `at`, or null if there is none within 14 days back. */
export function lastMarketOpen(at: Date): Date | null {
  let { date } = marketParts(at);
  for (let i = 0; i < 14; i += 1) {
    if (isTradingDay(date)) {
      const open = marketInstant(date, OPEN_MINUTES);
      if (open.getTime() <= at.getTime()) return open;
    }
    date = new Date(new Date(`${date}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

/** Milliseconds from `at` until the next open. */
export const msUntilNextOpen = (at: Date): number => nextMarketOpen(at).getTime() - at.getTime();

/** "Mon 9:30 ET": the weekday and time of an opening, for a screen. */
export function formatOpen(open: Date): string {
  const { weekday, minutes } = marketParts(open);
  const hh = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  return `${WEEKDAYS[weekday]} ${hh}:${mm} ET`;
}

/** The line a queued order carries on screen. */
export const queuedLabel = (at: Date): string => `Queued for the open (${formatOpen(nextMarketOpen(at))})`;
