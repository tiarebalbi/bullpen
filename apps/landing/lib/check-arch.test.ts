import { describe, expect, it } from "vitest";
import { loadCheckArchResult, parseCheckArchResult } from "./check-arch.js";

describe("parseCheckArchResult", () => {
  it("parses a well-formed result", () => {
    const content = JSON.stringify({
      ranAt: "2026-09-25T00:00:00.000Z",
      command: "pnpm --filter @bullpen/fitness-checks run check:arch",
      exitCode: 0,
      passed: true,
      summary: "check:arch passed: 5 ADL entries verified against /repo",
      output: "check:arch passed: 5 ADL entries verified against /repo",
    });

    const result = parseCheckArchResult(content, "check-arch-result.json");
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseCheckArchResult("{{", "x.json")).toThrow(/invalid JSON/);
  });

  it("throws a clear error when a required field is missing", () => {
    const malformed = JSON.stringify({ passed: true });
    expect(() => parseCheckArchResult(malformed, "x.json")).toThrow(/missing required "ranAt"/);
  });
});

describe("loadCheckArchResult", () => {
  it("throws a clear, actionable error when the file doesn't exist", () => {
    expect(() => loadCheckArchResult("/nonexistent/check-arch-result.json")).toThrow(
      /Run `node scripts\/run-check-arch\.mjs`/,
    );
  });
});
