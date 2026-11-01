import { describe, expect, it } from "vitest";
import { checkHandle } from "./rules.js";

describe("the handle rules", () => {
  it.each(["abc", "Tiare_B", "a-b-c", "x".repeat(20), "  padded  ", "Q9_-"])("accepts %j", (input) => {
    expect(checkHandle(input).ok).toBe(true);
  });

  it("trims the text it keeps", () => {
    expect(checkHandle("  padded  ")).toEqual({ ok: true, handle: "padded" });
  });

  it.each([
    ["too short", "ab"],
    ["too long", "x".repeat(21)],
    ["a space inside", "two words"],
    ["a dot", "a.b.c"],
    ["an accent", "café_"],
    ["an emoji", "bull🐂bull"],
    ["empty", ""],
    ["only spaces", "     "],
  ])("refuses %s", (_label, input) => {
    expect(checkHandle(input).ok).toBe(false);
  });

  it("refuses what is not text", () => {
    for (const input of [undefined, null, 42, {}, ["abc"]]) expect(checkHandle(input).ok).toBe(false);
  });
});
