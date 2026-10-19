import { describe, expect, it } from "vitest";
import { isUsMarketClosed } from "./marketSession.js";

// 2026-10-14 is a Wednesday, in daylight time (New York is UTC-4): 13:30 UTC is 09:30 there.
const at = (iso: string): number => Date.parse(iso);

describe("isUsMarketClosed", () => {
  it("is closed before 09:30 and from 16:00 in New York, open between", () => {
    expect(isUsMarketClosed(at("2026-10-14T13:29:00Z"))).toBe(true);
    expect(isUsMarketClosed(at("2026-10-14T13:30:00Z"))).toBe(false);
    expect(isUsMarketClosed(at("2026-10-14T19:59:00Z"))).toBe(false);
    expect(isUsMarketClosed(at("2026-10-14T20:00:00Z"))).toBe(true);
  });

  it("is closed all weekend", () => {
    expect(isUsMarketClosed(at("2026-10-17T15:00:00Z"))).toBe(true);
    expect(isUsMarketClosed(at("2026-10-18T15:00:00Z"))).toBe(true);
  });

  it("follows New York's clock through the change to standard time, not a fixed UTC offset", () => {
    // 2026-11-03 is a Tuesday after the clocks change (UTC-5): 14:30 UTC is 09:30.
    expect(isUsMarketClosed(at("2026-11-03T14:29:00Z"))).toBe(true);
    expect(isUsMarketClosed(at("2026-11-03T14:30:00Z"))).toBe(false);
  });
});
