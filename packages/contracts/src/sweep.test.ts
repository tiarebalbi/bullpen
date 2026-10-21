import { describe, expect, it } from "vitest";
import { validateSweepTick, type SweepTick } from "./sweep.js";

const tick: SweepTick = { at: "2026-10-20T12:00:00.000Z", open: 2, flagged: 0, fills: 1, cancels: 0, placed: 0, cancelRequested: 0, released: 1, releaseFailed: 0, errors: 0 };

describe("the sweep reply contract", () => {
  it("accepts what the route sends", () => {
    expect(validateSweepTick(tick)).toEqual({ valid: true, errors: null });
  });
  it("rejects a missing field, a negative count, a fraction and an extra field", () => {
    const missing: Partial<SweepTick> = { ...tick };
    delete missing.open;
    expect(validateSweepTick(missing).valid).toBe(false);
    expect(validateSweepTick({ ...tick, open: -1 }).valid).toBe(false);
    expect(validateSweepTick({ ...tick, fills: 1.5 }).valid).toBe(false);
    expect(validateSweepTick({ ...tick, secret: "x" }).valid).toBe(false);
    expect(validateSweepTick({ ...tick, at: "yesterday" }).valid).toBe(false);
  });
});
