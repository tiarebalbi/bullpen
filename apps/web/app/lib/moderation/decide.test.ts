import { describe, expect, it } from "vitest";
import { APPROVE_ABOVE } from "./config.js";
import { decide } from "./decide.js";
import type { GatewayResult } from "./gateway.js";

const answer = (probability: number): GatewayResult => ({ ok: true, probability, costUsd: null, latencyMs: 5 });

describe("the verdict", () => {
  it("approves a probability strictly above the threshold", () => {
    expect(decide(answer(0.95), 0.9)).toEqual({ outcome: "approved", probability: 0.95 });
    expect(decide(answer(1), 0.9).outcome).toBe("approved");
  });

  it("sends a probability exactly at the threshold to review", () => {
    expect(decide(answer(0.9), 0.9)).toEqual({ outcome: "review", probability: 0.9, reason: "below-threshold" });
    expect(decide(answer(APPROVE_ABOVE)).outcome).toBe("review");
  });

  it("sends a lower probability to review and keeps it for the reviewer", () => {
    expect(decide(answer(0.2), 0.9)).toEqual({ outcome: "review", probability: 0.2, reason: "below-threshold" });
    expect(decide(answer(0), 0.9).outcome).toBe("review");
  });

  it("never approves a failure, whatever the reason", () => {
    for (const reason of ["timeout", "rate-limited", "malformed", "no-key", "unavailable"] as const) {
      expect(decide({ ok: false, reason, latencyMs: 1 })).toEqual({ outcome: "review", probability: null, reason });
    }
  });

  it("never approves a probability that is not a number", () => {
    expect(decide(answer(Number.NaN)).outcome).toBe("review");
    expect(decide(answer(Number.POSITIVE_INFINITY)).outcome).toBe("review");
  });

  it("uses the threshold the rule gives: the highest reject of the re-measure (0.86) plus a margin of 0.02", () => {
    expect(APPROVE_ABOVE).toBe(0.88);
    expect(APPROVE_ABOVE).toBeCloseTo(0.86 + 0.02, 10);
  });

  it("with the real threshold, a probability of exactly 0.88 goes to review and 0.89 approves", () => {
    expect(decide(answer(0.88))).toEqual({ outcome: "review", probability: 0.88, reason: "below-threshold" });
    expect(decide(answer(0.89))).toEqual({ outcome: "approved", probability: 0.89 });
  });

  it("with the real threshold, the neighbours on either side behave the same way: 0.87 reviews, 0.9 and 0.95 approve", () => {
    expect(decide(answer(0.87)).outcome).toBe("review");
    expect(decide(answer(0.9)).outcome).toBe("approved");
    expect(decide(answer(0.95)).outcome).toBe("approved");
  });
});
