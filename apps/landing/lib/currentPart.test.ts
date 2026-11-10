import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurrentPart, loadPartTag } from "./currentPart.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("loadCurrentPart", () => {
  it("reads the real timeline's current moment as a part number", () => {
    const part = loadCurrentPart(repoRoot);
    expect(Number.isInteger(part)).toBe(true);
    expect(part).toBeGreaterThanOrEqual(1);
    expect(part).toBeLessThanOrEqual(6);
  });

  it("reads the Clarity tag from the same timeline: a part number as text, or 'bonus'", () => {
    expect(loadPartTag(repoRoot)).toMatch(/^([1-6]|bonus)$/);
  });
});
