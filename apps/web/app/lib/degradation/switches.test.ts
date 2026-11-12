import { describe, expect, it } from "vitest";
import { SWITCHES, SWITCH_ORDER, isOff, switchesOff } from "./switches.js";

describe("the kill switches", () => {
  it("are all on when the variable is unset or empty", () => {
    for (const value of [undefined, "", "  ", ","]) expect(switchesOff(value).size).toBe(0);
    for (const name of SWITCHES) expect(isOff(name, {})).toBe(false);
  });

  it("turns off exactly the names listed, whatever the spacing and case", () => {
    const off = switchesOff(" Price-Stream , leaderboard-refresh ");
    expect([...off].sort()).toEqual(["leaderboard-refresh", "price-stream"]);
    expect(isOff("handle-moderation", { BULLPEN_OFF: "price-stream" })).toBe(false);
    expect(isOff("price-stream", { BULLPEN_OFF: "price-stream" })).toBe(true);
  });

  it("ignores a name that is not a switch: a typo, or order entry, which has no switch", () => {
    expect(switchesOff("orders,order-entry,stream").size).toBe(0);
  });

  it("lists the order they go in, with every switch once and the moderation call first", () => {
    expect([...SWITCH_ORDER].sort()).toEqual([...SWITCHES].sort());
    expect(SWITCH_ORDER[0]).toBe("handle-moderation");
  });
});
