import { describe, expect, it } from "vitest";
import { latestBuiltPart } from "./latestBuiltPart.js";

type Status = "built" | "planned";
const parts = (statuses: Status[]) => statuses.map((status, i) => ({ part: i + 1, status }));

describe("latestBuiltPart", () => {
  it("is the highest built part: Parts 1 and 2 built, 3 to 6 planned, gives 2", () => {
    expect(latestBuiltPart(parts(["built", "built", "planned", "planned", "planned", "planned"]))).toBe(2);
  });

  it("is 1 when only Part 1 is built", () => {
    expect(latestBuiltPart(parts(["built", "planned", "planned", "planned", "planned", "planned"]))).toBe(1);
  });

  it("moves with the content: Part 3 built as well gives 3, every part built gives the last", () => {
    expect(latestBuiltPart(parts(["built", "built", "built", "planned", "planned", "planned"]))).toBe(3);
    expect(latestBuiltPart(parts(["built", "built", "built", "built", "built", "built"]))).toBe(6);
  });

  it("does not depend on the order the parts are listed in", () => {
    const shuffled = [
      { part: 3, status: "planned" as const },
      { part: 2, status: "built" as const },
      { part: 1, status: "built" as const },
    ];
    expect(latestBuiltPart(shuffled)).toBe(2);
  });

  it("falls back to the first part when nothing is built, and to 1 when there are no parts", () => {
    expect(latestBuiltPart(parts(["planned", "planned"]))).toBe(1);
    expect(latestBuiltPart([])).toBe(1);
  });
});
