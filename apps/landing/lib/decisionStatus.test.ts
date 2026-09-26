import { describe, expect, it } from "vitest";
import { isSuperseded, statusTone } from "./decisionStatus.js";

describe("statusTone / isSuperseded", () => {
  it("maps Accepted to the gain tone", () => {
    expect(statusTone("Accepted")).toBe("gain");
    expect(isSuperseded("Accepted")).toBe(false);
  });

  it("maps Proposed to the accent tone", () => {
    expect(statusTone("Proposed")).toBe("accent");
    expect(isSuperseded("Proposed")).toBe(false);
  });

  it("maps Superseded to the outline tone and flags it superseded", () => {
    expect(statusTone("Superseded")).toBe("outline");
    expect(isSuperseded("Superseded")).toBe(true);
  });

  it("falls back to neutral for anything else (e.g. Draft), never guessing", () => {
    expect(statusTone("Draft")).toBe("neutral");
    expect(statusTone("Rejected")).toBe("neutral");
    expect(isSuperseded("Draft")).toBe(false);
  });

  it("is an exact, case-sensitive match, not a loose contains check", () => {
    expect(statusTone("superseded")).toBe("neutral");
    expect(isSuperseded("superseded")).toBe(false);
  });
});
