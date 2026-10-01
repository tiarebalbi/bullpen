import { describe, expect, it } from "vitest";
import { resolveAnalyticsConfig } from "./config.js";

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
