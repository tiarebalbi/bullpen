import { afterEach, describe, expect, it, vi } from "vitest";
import { signInAvailable } from "./server.js";

describe("signInAvailable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on in production when both settings exist", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/db/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(40));
    vi.stubEnv("VERCEL_ENV", "production");
    expect(signInAvailable()).toBe(true);
  });

  it("is off on a Vercel preview, whatever is set", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/db/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(40));
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(signInAvailable()).toBe(false);
  });

  it("is off when either setting is missing", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(40));
    expect(signInAvailable()).toBe(false);
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/db/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    expect(signInAvailable()).toBe(false);
  });
});
