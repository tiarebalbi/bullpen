import { describe, expect, it } from "vitest";
import { STARTING_CASH, neutralHandle } from "./players.js";

describe("neutralHandle", () => {
  it("is 'Player' and four hex characters, the same for the same user", () => {
    expect(neutralHandle("user-123")).toMatch(/^Player [0-9A-F]{4}$/);
    expect(neutralHandle("user-123")).toBe(neutralHandle("user-123"));
  });

  it("takes more of the hash when asked, and the shorter label is the start of the longer", () => {
    const four = neutralHandle("user-123", 4).replace("Player ", "");
    expect(neutralHandle("user-123", 6)).toBe(`Player ${four}${neutralHandle("user-123", 6).slice(-2)}`);
    expect(neutralHandle("user-123", 6)).toMatch(/^Player [0-9A-F]{6}$/);
  });

  it("does not contain the user id, so it names nothing a sign-in knows", () => {
    expect(neutralHandle("octocat-the-login")).not.toMatch(/octocat|login/i);
  });
});

describe("STARTING_CASH", () => {
  it("is 100,000 in play money, as one decimal string", () => {
    expect(STARTING_CASH).toBe("100000");
  });
});
