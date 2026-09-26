import { describe, expect, it } from "vitest";
import { PRODUCTION_HOST, isProductionHost } from "./productionHost.js";

describe("isProductionHost", () => {
  it("is true for the real production host", () => {
    expect(isProductionHost(PRODUCTION_HOST)).toBe(true);
  });

  it("strips a port before comparing", () => {
    expect(isProductionHost(`${PRODUCTION_HOST}:3000`)).toBe(true);
  });

  it("is false for a Vercel preview/production alias", () => {
    expect(isProductionHost("bullpen-landing.vercel.app")).toBe(false);
    expect(isProductionHost("bullpen-landing-git-fix-landing-fidelity-tiare-balbis-projects.vercel.app")).toBe(false);
  });

  it("is false for localhost", () => {
    expect(isProductionHost("localhost:3000")).toBe(false);
  });

  it("is false for a missing host", () => {
    expect(isProductionHost(null)).toBe(false);
    expect(isProductionHost(undefined)).toBe(false);
    expect(isProductionHost("")).toBe(false);
  });
});
