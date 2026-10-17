import { describe, expect, it } from "vitest";
import { endOfNewYorkDay, isTradingDay, marketHolidays, nextTradingDay, stockValidUntil } from "./calendar.js";

describe("the market's holidays", () => {
  it("are the NYSE's for 2026", () => {
    expect(marketHolidays(2026)).toEqual(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
  });

  it("are the NYSE's for 2027, with the Saturday holidays observed on the Friday and the Sunday one on the Monday", () => {
    expect(marketHolidays(2027)).toEqual(["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
  });

  it("do not close the market on the Friday before a Saturday New Year's Day", () => {
    expect(marketHolidays(2022)).not.toContain("2021-12-31");
    expect(marketHolidays(2022)).not.toContain("2022-01-01");
  });

  it("find Good Friday from Easter, in a year with a late Easter and one with an early one", () => {
    expect(marketHolidays(2025)).toContain("2025-04-18");
    expect(marketHolidays(2024)).toContain("2024-03-29");
  });
});

describe("trading days", () => {
  it("are weekdays that are not holidays", () => {
    expect(isTradingDay("2026-10-13")).toBe(true); // a Tuesday
    expect(isTradingDay("2026-10-17")).toBe(false); // a Saturday
    expect(isTradingDay("2026-10-18")).toBe(false); // a Sunday
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(isTradingDay("2026-11-27")).toBe(true); // the day after
  });

  it("move to the next one over a weekend and over a holiday weekend", () => {
    expect(nextTradingDay("2026-10-16")).toBe("2026-10-19");
    expect(nextTradingDay("2026-05-22")).toBe("2026-05-26"); // Friday before Memorial Day
  });
});

describe("when a stock price stops being current", () => {
  it("ends a New York day at 23:59:59 local, in daylight time and in standard time", () => {
    expect(endOfNewYorkDay("2026-10-13").toISOString()).toBe("2026-10-14T03:59:59.000Z");
    expect(endOfNewYorkDay("2026-11-02").toISOString()).toBe("2026-11-03T04:59:59.000Z");
  });

  it("is the end of the next trading day: a Friday close is current through Monday", () => {
    expect(stockValidUntil("2026-10-16").toISOString()).toBe("2026-10-20T03:59:59.000Z");
  });

  it("covers a holiday Monday: a Friday close is current through Tuesday", () => {
    expect(stockValidUntil("2026-05-22").toISOString()).toBe("2026-05-27T03:59:59.000Z");
  });

  it("crosses the end of daylight time on the right offset", () => {
    expect(stockValidUntil("2026-10-30").toISOString()).toBe("2026-11-03T04:59:59.000Z");
  });
});

describe("the closing time", () => {
  it("is 16:00 New York time, 20:00 UTC in daylight time and 21:00 UTC in standard time", async () => {
    const { closeOfNewYorkDay } = await import("./calendar.js");
    expect(closeOfNewYorkDay("2026-10-13").toISOString()).toBe("2026-10-13T20:00:00.000Z");
    expect(closeOfNewYorkDay("2026-11-02").toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });
});
