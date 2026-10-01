import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurrentPart } from "./currentPart.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("loadCurrentPart", () => {
  it("reads the real timeline's current moment as a part number", () => {
    const part = loadCurrentPart(repoRoot);
    expect(Number.isInteger(part)).toBe(true);
    expect(part).toBeGreaterThanOrEqual(1);
    expect(part).toBeLessThanOrEqual(6);
  });
});
