import { describe, expect, it } from "vitest";
import { builtInLabel } from "./builtIn.js";

describe("builtInLabel", () => {
  it("turns a moment id into the part's name", () => {
    expect(builtInLabel("part-01")).toBe("Part 1");
    expect(builtInLabel("part-12")).toBe("Part 12");
  });

  it("returns anything else as it is", () => {
    expect(builtInLabel("somewhere")).toBe("somewhere");
  });
});
