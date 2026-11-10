import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentMomentFromTimeline, loadCurrentMoment, opensOnBonus } from "./currentMoment.js";

const timeline = (current: string) =>
  JSON.stringify({
    "current-moment": current,
    moments: [
      { "unique-id": "part-04", metadata: {} },
      { "unique-id": "bonus-handles", metadata: { kind: "bonus", after: "part-04", before: "part-05" } },
      { "unique-id": "part-05", metadata: {} },
    ],
  });

describe("currentMomentFromTimeline", () => {
  it("says the current moment is the bonus when its moment is of kind bonus, whatever its id", () => {
    expect(currentMomentFromTimeline(timeline("bonus-handles"))).toEqual({ id: "bonus-handles", bonus: true });
  });

  it("says it is not the bonus once the current moment is a part (Part 5 published)", () => {
    expect(currentMomentFromTimeline(timeline("part-05"))).toEqual({ id: "part-05", bonus: false });
  });

  it("reads the kind from the moment, not from its id", () => {
    const renamed = JSON.stringify({ "current-moment": "anything", moments: [{ "unique-id": "anything", metadata: { kind: "bonus" } }] });
    expect(currentMomentFromTimeline(renamed)).toEqual({ id: "anything", bonus: true });
  });

  it("gives nothing for a timeline it cannot read", () => {
    expect(currentMomentFromTimeline("not json")).toBeNull();
    expect(currentMomentFromTimeline("{}")).toBeNull();
  });
});

describe("opensOnBonus", () => {
  it("opens on the bonus only when it is the current moment and built", () => {
    expect(opensOnBonus({ id: "b", bonus: true }, { status: "built" })).toBe(true);
    expect(opensOnBonus({ id: "b", bonus: true }, { status: "planned" })).toBe(false);
    expect(opensOnBonus({ id: "part-05", bonus: false }, { status: "built" })).toBe(false);
    expect(opensOnBonus(null, { status: "built" })).toBe(false);
    expect(opensOnBonus({ id: "b", bonus: true }, null)).toBe(false);
  });
});

describe("loadCurrentMoment", () => {
  it("reads the real timeline", () => {
    const current = loadCurrentMoment(join(import.meta.dirname, "..", "..", ".."));
    expect(current?.id).toBeTruthy();
  });
});
