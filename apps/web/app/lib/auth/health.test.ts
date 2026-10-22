import { describe, expect, it } from "vitest";
import { authConfigIssues } from "./health.js";

const SECRET = "x".repeat(32);
const GOOD = { NEON_AUTH_BASE_URL: "https://auth.example.test/db/auth", NEON_AUTH_COOKIE_SECRET: SECRET };

describe("authConfigIssues", () => {
  it("finds nothing wrong with a usable pair", () => {
    expect(authConfigIssues(GOOD)).toEqual([]);
  });

  it("names each missing variable", () => {
    expect(authConfigIssues({})).toEqual(["NEON_AUTH_BASE_URL is not set", "NEON_AUTH_COOKIE_SECRET is not set"]);
  });

  it("names a base URL that is not https or not a URL, and a short cookie secret", () => {
    expect(authConfigIssues({ ...GOOD, NEON_AUTH_BASE_URL: "http://auth.example.test" })).toEqual(["NEON_AUTH_BASE_URL must be an https URL"]);
    expect(authConfigIssues({ ...GOOD, NEON_AUTH_BASE_URL: "auth.example.test" })).toEqual(["NEON_AUTH_BASE_URL is not a URL"]);
    expect(authConfigIssues({ ...GOOD, NEON_AUTH_COOKIE_SECRET: "short" })).toEqual(["NEON_AUTH_COOKIE_SECRET is shorter than 32 characters"]);
  });

  it("has nothing to report on a preview, where sign-in is off by design", () => {
    expect(authConfigIssues({ VERCEL_ENV: "preview" })).toEqual([]);
  });

  it("never repeats a value", () => {
    expect(JSON.stringify(authConfigIssues({ NEON_AUTH_BASE_URL: "nope-url-value", NEON_AUTH_COOKIE_SECRET: "tiny-secret-value" }))).not.toMatch(/nope-url-value|tiny-secret-value/);
  });
});
