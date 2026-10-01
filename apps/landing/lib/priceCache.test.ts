import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPriceCacheSeconds } from "./priceCache.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("readPriceCacheSeconds", () => {
  it("reads the interval from the real price route", () => {
    expect(readPriceCacheSeconds(repoRoot)).toBe(300);
  });

  it("returns null, rather than guessing, when the route cannot be read", () => {
    expect(readPriceCacheSeconds(join(repoRoot, "nowhere"))).toBeNull();
  });
});
