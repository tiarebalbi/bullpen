import { describe, expect, it } from "vitest";
import { limitMessage } from "./respond.js";

describe("the message for a player over the limit", () => {
  it("says how many changes, in how many hours, and about when to try again", () => {
    expect(limitMessage(5, 24, 7300)).toBe("You have changed your handle 5 times in the last 24 hours, which is as many as I allow. Try again in about 3 hours.");
  });

  it("says an hour or less when it is nearly over, and rounds up", () => {
    expect(limitMessage(5, 24, 30)).toContain("in about an hour or less");
    expect(limitMessage(5, 24, 3600)).toContain("in about an hour or less");
    expect(limitMessage(5, 24, 3601)).toContain("in about 2 hours");
  });
});
