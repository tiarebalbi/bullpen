import { describe, expect, it } from "vitest";
import {
  NYSE_EARLY_CLOSES,
  NYSE_HOLIDAYS,
  calendarCovers,
  formatOpen,
  isMarketOpen,
  isTradingDay,
  lastMarketOpen,
  marketInstant,
  marketParts,
  msUntilNextOpen,
  nextMarketOpen,
  queuedLabel,
} from "./marketCalendar.js";

const at = (iso: string): Date => new Date(iso);

describe("regular hours", () => {
  // 2026-11-12 is a Thursday, in EST (UTC-5).
  it("opens at 9:30 ET inclusive and closes at 16:00 ET exclusive", () => {
    expect(isMarketOpen(at("2026-11-12T14:29:59Z"))).toBe(false);
    expect(isMarketOpen(at("2026-11-12T14:30:00Z"))).toBe(true);
    expect(isMarketOpen(at("2026-11-12T20:59:59Z"))).toBe(true);
    expect(isMarketOpen(at("2026-11-12T21:00:00Z"))).toBe(false);
  });
  it("is closed on weekends", () => {
    expect(isMarketOpen(at("2026-11-14T15:00:00Z"))).toBe(false); // Saturday
    expect(isMarketOpen(at("2026-11-15T15:00:00Z"))).toBe(false); // Sunday
  });
  it("reads New York's date, not UTC's: 20:00 ET Friday is already Saturday in UTC", () => {
    expect(marketParts(at("2026-11-14T01:00:00Z"))).toEqual({ date: "2026-11-13", minutes: 20 * 60, weekday: 5 });
  });
});

describe("holidays", () => {
  it("has the NYSE's ten 2026 and ten 2027 holidays", () => {
    expect([...NYSE_HOLIDAYS].filter((d) => d.startsWith("2026"))).toHaveLength(10);
    expect([...NYSE_HOLIDAYS].filter((d) => d.startsWith("2027"))).toHaveLength(10);
  });
  it("is closed on a holiday in the middle of a session", () => {
    expect(isMarketOpen(at("2026-11-26T16:00:00Z"))).toBe(false); // Thanksgiving
    expect(isMarketOpen(at("2026-07-03T16:00:00Z"))).toBe(false); // Independence Day observed
    expect(isMarketOpen(at("2027-12-24T16:00:00Z"))).toBe(false); // Christmas observed
  });
  it("never lists a holiday on a weekend: a weekend holiday is observed on the Friday or Monday", () => {
    for (const day of NYSE_HOLIDAYS) expect([0, 6]).not.toContain(new Date(`${day}T12:00:00Z`).getUTCDay());
  });
  it("skips a holiday when looking for the next open", () => {
    // Thursday 2026-11-26 after Wednesday's close: next open is Friday the 27th.
    expect(nextMarketOpen(at("2026-11-26T15:00:00Z")).toISOString()).toBe("2026-11-27T14:30:00.000Z");
    // Thursday 2026-07-02 after the close: the 3rd is observed, so Monday the 6th.
    expect(nextMarketOpen(at("2026-07-02T21:30:00Z")).toISOString()).toBe("2026-07-06T13:30:00.000Z");
  });
});

describe("early closes", () => {
  it("closes at 13:00 ET on the day after Thanksgiving and Christmas Eve 2026", () => {
    expect([...NYSE_EARLY_CLOSES].sort()).toEqual(["2026-11-27", "2026-12-24", "2027-11-26"]);
    expect(isMarketOpen(at("2026-11-27T17:59:59Z"))).toBe(true); // 12:59:59 ET
    expect(isMarketOpen(at("2026-11-27T18:00:00Z"))).toBe(false); // 13:00 ET
  });
  it("is a trading day all the same", () => {
    expect(isTradingDay("2026-11-27")).toBe(true);
  });
});

describe("the next open", () => {
  it("is today's 9:30 before the open and the next trading day's at or after it", () => {
    expect(nextMarketOpen(at("2026-11-12T12:00:00Z")).toISOString()).toBe("2026-11-12T14:30:00.000Z");
    expect(nextMarketOpen(at("2026-11-12T14:30:00Z")).toISOString()).toBe("2026-11-13T14:30:00.000Z");
  });
  it("skips the weekend: Friday evening queues for Monday 9:30", () => {
    const friday = at("2026-11-13T23:00:00Z");
    expect(nextMarketOpen(friday).toISOString()).toBe("2026-11-16T14:30:00.000Z");
    expect(queuedLabel(friday)).toBe("Queued for the open (Mon 9:30 ET)");
  });
  it("holds across the spring clock change: 9:30 is 13:30Z in EDT, 14:30Z in EST", () => {
    // Friday 2026-03-06 (EST), clocks go forward on Sunday the 8th.
    expect(nextMarketOpen(at("2026-03-06T23:00:00Z")).toISOString()).toBe("2026-03-09T13:30:00.000Z");
    expect(isMarketOpen(at("2026-03-09T13:29:59Z"))).toBe(false);
    expect(isMarketOpen(at("2026-03-09T13:30:00Z"))).toBe(true);
  });
  it("holds across the autumn clock change", () => {
    // Friday 2026-10-30 (EDT), clocks go back on Sunday 2026-11-01.
    expect(nextMarketOpen(at("2026-10-30T23:00:00Z")).toISOString()).toBe("2026-11-02T14:30:00.000Z");
    expect(isMarketOpen(at("2026-11-02T14:29:59Z"))).toBe(false);
    expect(isMarketOpen(at("2026-11-02T14:30:00Z"))).toBe(true);
  });
  it("does not lose a day on the clock-change Sunday itself", () => {
    expect(nextMarketOpen(at("2026-03-08T12:00:00Z")).toISOString()).toBe("2026-03-09T13:30:00.000Z");
  });
  it("counts the milliseconds to it", () => {
    expect(msUntilNextOpen(at("2026-11-12T14:29:00Z"))).toBe(60_000);
  });
  it("finds the last open at or before an instant", () => {
    expect(lastMarketOpen(at("2026-11-16T14:30:00Z"))?.toISOString()).toBe("2026-11-16T14:30:00.000Z");
    expect(lastMarketOpen(at("2026-11-16T14:29:59Z"))?.toISOString()).toBe("2026-11-13T14:30:00.000Z");
  });
  it("builds an instant from a date and minutes, in either offset", () => {
    expect(marketInstant("2026-07-06", 9 * 60 + 30).toISOString()).toBe("2026-07-06T13:30:00.000Z");
    expect(marketInstant("2026-12-07", 9 * 60 + 30).toISOString()).toBe("2026-12-07T14:30:00.000Z");
  });
});

describe("what it knows", () => {
  it("covers 2026 and 2027 and says so", () => {
    expect(calendarCovers(at("2026-11-12T12:00:00Z"))).toBe(true);
    expect(calendarCovers(at("2028-01-03T12:00:00Z"))).toBe(false);
  });
  it("formats an opening for a screen", () => {
    expect(formatOpen(at("2026-11-16T14:30:00Z"))).toBe("Mon 9:30 ET");
  });
  it("reminds whoever is here in 2028 that the holiday list ends on 2027-12-31 and must be extended from NYSE's page", () => {
    expect(new Date().getUTCFullYear(), "extend NYSE_HOLIDAYS and NYSE_EARLY_CLOSES in marketCalendar.ts, and CALENDAR_LAST_DATE").toBeLessThanOrEqual(2027);
  });
});
