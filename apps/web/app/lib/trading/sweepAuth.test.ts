import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeSweep } from "./sweepAuth.js";

const request = (header?: string) => new Request("http://x/api/internal/sweep", { method: "POST", headers: header ? { authorization: header } : {} });

describe("authorizeSweep", () => {
  beforeEach(() => vi.stubEnv("SWEEP_SECRET", "right-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the right bearer token", () => {
    expect(authorizeSweep(request("Bearer right-secret"))).toBe("ok");
  });

  it("refuses a missing, wrong, truncated, extended or differently-schemed token", () => {
    for (const header of [undefined, "Bearer wrong", "Bearer right-secre", "Bearer right-secret-and-more", "Basic right-secret", "right-secret", "Bearer "]) {
      expect(authorizeSweep(request(header))).toBe("unauthorized");
    }
  });

  it("with no secret configured nobody may run the sweep, not even an empty token", () => {
    vi.stubEnv("SWEEP_SECRET", "");
    expect(authorizeSweep(request("Bearer "))).toBe("not-configured");
    expect(authorizeSweep(request("Bearer anything"))).toBe("not-configured");
  });
});
