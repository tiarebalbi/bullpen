import { describe, expect, it } from "vitest";
import { currentPartFromTimeline, partTagFromTimeline, resolveAnalyticsConfig } from "./config.js";

const IDS = { NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST000000", NEXT_PUBLIC_CLARITY_PROJECT_ID: "clar1tytest" };

describe("when a tag may load at all", () => {
  it("never outside production, however the ids are set", () => {
    expect(resolveAnalyticsConfig({ ...IDS, VERCEL_ENV: "preview" })).toBeNull();
    expect(resolveAnalyticsConfig({ ...IDS, VERCEL_ENV: "development" })).toBeNull();
    expect(resolveAnalyticsConfig({ ...IDS })).toBeNull();
  });

  it("never without an id", () => {
    expect(resolveAnalyticsConfig({ VERCEL_ENV: "production" })).toBeNull();
    expect(resolveAnalyticsConfig({ VERCEL_ENV: "production", NEXT_PUBLIC_GA_MEASUREMENT_ID: "  " })).toBeNull();
  });

  it("treats something that is not plainly an id as unset", () => {
    const config = resolveAnalyticsConfig({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-X"></script><script>',
      NEXT_PUBLIC_CLARITY_PROJECT_ID: IDS.NEXT_PUBLIC_CLARITY_PROJECT_ID,
    });
    expect(config).toEqual({ googleId: null, clarityId: "clar1tytest" });
  });

  it("returns the ids that are set in production, each tool independent of the other", () => {
    expect(resolveAnalyticsConfig({ ...IDS, VERCEL_ENV: "production" })).toEqual({
      googleId: "G-TEST000000",
      clarityId: "clar1tytest",
    });
    expect(
      resolveAnalyticsConfig({ VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "clar1tytest" }),
    ).toEqual({ googleId: null, clarityId: "clar1tytest" });
  });
});

describe("the part sent to Clarity", () => {
  it("is the timeline's current moment", () => {
    expect(currentPartFromTimeline('{"current-moment":"part-01"}')).toBe(1);
    expect(currentPartFromTimeline('{"current-moment":"part-02"}')).toBe(2);
  });
  it("is the part a bonus moment follows, when the bonus is the current moment (it has no part number)", () => {
    const timeline = (current: string) => JSON.stringify({ "current-moment": current, moments: [{ "unique-id": "part-04" }, { "unique-id": "bonus-handles", metadata: { kind: "bonus", after: "part-04" } }, { "unique-id": "part-05" }] });
    expect(currentPartFromTimeline(timeline("bonus-handles"))).toBe(4);
    expect(currentPartFromTimeline(timeline("part-04"))).toBe(4);
    expect(currentPartFromTimeline(timeline("part-05"))).toBe(5);
  });
  it("does not take a moment that is not a bonus for one, or a bonus with no part to follow", () => {
    expect(currentPartFromTimeline(JSON.stringify({ "current-moment": "bonus-x", moments: [{ "unique-id": "bonus-x", metadata: { kind: "bonus" } }] }))).toBeNull();
    expect(currentPartFromTimeline(JSON.stringify({ "current-moment": "extra", moments: [{ "unique-id": "extra", metadata: { after: "part-02" } }] }))).toBeNull();
  });
  it("is null when the timeline does not say", () => {
    expect(currentPartFromTimeline("{}")).toBeNull();
    expect(currentPartFromTimeline("not json")).toBeNull();
    expect(currentPartFromTimeline('{"current-moment":"later"}')).toBeNull();
  });
});

describe("partTagFromTimeline", () => {
  const timeline = (current: string) => ({ "current-moment": current, moments: [{ "unique-id": "part-04" }, { "unique-id": "bonus-handles", metadata: { kind: "bonus", after: "part-04" } }, { "unique-id": "part-05" }] });
  it("is the part number as text for a part", () => {
    expect(partTagFromTimeline(timeline("part-04"))).toBe("4");
    expect(partTagFromTimeline(timeline("part-05"))).toBe("5");
  });
  it("is 'bonus' while a bonus moment is the current one, told by its kind and not by its id", () => {
    expect(partTagFromTimeline(timeline("bonus-handles"))).toBe("bonus");
    expect(partTagFromTimeline({ "current-moment": "anything", moments: [{ "unique-id": "anything", metadata: { kind: "bonus" } }] })).toBe("bonus");
  });
  it("is the part again once the next part is the current moment", () => {
    expect(partTagFromTimeline(timeline("part-05"))).not.toBe("bonus");
  });
  it("is null when the timeline does not say", () => {
    expect(partTagFromTimeline({})).toBeNull();
    expect(partTagFromTimeline(null)).toBeNull();
    expect(partTagFromTimeline({ "current-moment": "later" })).toBeNull();
  });
});
