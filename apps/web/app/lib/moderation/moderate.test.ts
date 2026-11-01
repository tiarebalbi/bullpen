import { describe, expect, it, vi } from "vitest";
import type { Decision, Submitted } from "@bullpen/db-handles";
import type { GatewayResult } from "./gateway.js";
import { moderateSaved, saveAndModerate, type ModerationStore } from "./moderate.js";

function setup(over: { submitted?: Submitted; ask?: () => Promise<GatewayResult>; record?: () => Promise<boolean> } = {}) {
  const recorded: Decision[] = [];
  const store: ModerationStore = {
    submit: vi.fn(async () => over.submitted ?? { ok: true as const, handleId: "h-1" }),
    record: vi.fn(async (decision: Decision) => {
      if (over.record) return over.record();
      recorded.push(decision);
      return true;
    }),
  };
  const ask = vi.fn(over.ask ?? (async (): Promise<GatewayResult> => ({ ok: true, probability: 0.99, costUsd: 0, latencyMs: 12 })));
  const lines: string[] = [];
  return { store, ask, recorded, lines, deps: { store, ask, log: (line: string) => lines.push(line) } };
}

describe("saving a handle", () => {
  it("asks no model when a rule fails, and saves nothing", async () => {
    const t = setup();
    const outcome = await saveAndModerate("user-1", "no good!", t.deps);
    expect(outcome).toMatchObject({ ok: false, kind: "invalid" });
    expect(t.ask).not.toHaveBeenCalled();
    expect(t.store.submit).not.toHaveBeenCalled();
  });

  it("asks no model when the name is taken", async () => {
    const t = setup({ submitted: { ok: false, reason: "taken" } });
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: false, kind: "taken" });
    expect(t.ask).not.toHaveBeenCalled();
  });

  it("approves a handle the model is sure about", async () => {
    const t = setup();
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: true, status: "approved" });
    expect(t.ask).toHaveBeenCalledWith("BullRun");
    expect(t.recorded).toEqual([{ handleId: "h-1", handle: "BullRun", outcome: "approved", probability: 0.99 }]);
  });

  it("sends an unsure answer to review with its probability", async () => {
    const t = setup({ ask: async () => ({ ok: true, probability: 0.4, costUsd: 0, latencyMs: 9 }) });
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: true, status: "review" });
    expect(t.recorded[0]).toMatchObject({ outcome: "review", probability: 0.4, reason: "below-threshold" });
  });

  it("sends every kind of failure to review, never to approved", async () => {
    for (const reason of ["timeout", "rate-limited", "malformed", "no-key", "unavailable"] as const) {
      const t = setup({ ask: async () => ({ ok: false, reason, latencyMs: 3 }) });
      expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: true, status: "review" });
      expect(t.recorded[0]).toMatchObject({ outcome: "review", probability: null, reason });
    }
  });

  it("treats a gateway call that throws as a failure for review, not as an error", async () => {
    const t = setup({ ask: async () => Promise.reject(new Error("boom")) });
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: true, status: "review" });
    expect(t.recorded[0]).toMatchObject({ outcome: "review", reason: "unavailable" });
  });

  it("leaves the handle pending, and does not throw, when the verdict cannot be recorded", async () => {
    const t = setup({ record: async () => Promise.reject(new Error("db down")) });
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: true, status: "pending" });
  });

  it("logs the handle id, status, probability and latency, and never the text or the player", async () => {
    const t = setup();
    await saveAndModerate("user-secret-42", "BullRun", t.deps);
    expect(t.lines).toHaveLength(1);
    expect(JSON.parse(t.lines[0]!)).toEqual({ at: "moderation", handleId: "h-1", status: "approved", probability: 0.99, latencyMs: 12 });
    expect(t.lines.join("")).not.toMatch(/BullRun|user-secret/);
  });
});

describe("the limit on changes", () => {
  it("refuses a player over the limit without asking the model, and says when to try again", async () => {
    const t = setup({ submitted: { ok: false, reason: "limit", retryAfterSeconds: 5400 } });
    expect(await saveAndModerate("user-1", "BullRun", t.deps)).toEqual({ ok: false, kind: "limit", retryAfterSeconds: 5400 });
    expect(t.ask).not.toHaveBeenCalled();
    expect(t.store.record).not.toHaveBeenCalled();
    expect(t.lines).toEqual([]);
  });

  it("checks the rules first: a handle that fails them does not use up the player's chance", async () => {
    const t = setup({ submitted: { ok: false, reason: "limit", retryAfterSeconds: 1 } });
    expect(await saveAndModerate("user-1", "no good!", t.deps)).toMatchObject({ ok: false, kind: "invalid" });
    expect(t.store.submit).not.toHaveBeenCalled();
  });
});

describe("moderating a handle that is already saved (a retry)", () => {
  it("asks the model once about that handle and records the verdict, without saving anything", async () => {
    const t = setup();
    expect(await moderateSaved("h-9", "StuckOne", t.deps)).toBe("approved");
    expect(t.ask).toHaveBeenCalledExactlyOnceWith("StuckOne");
    expect(t.store.submit).not.toHaveBeenCalled();
    expect(t.recorded).toEqual([{ handleId: "h-9", handle: "StuckOne", outcome: "approved", probability: 0.99 }]);
  });

  it("sends a failure to review, as when a player saves it", async () => {
    const t = setup({ ask: async () => ({ ok: false, reason: "timeout", latencyMs: 2000 }) });
    expect(await moderateSaved("h-9", "StuckOne", t.deps)).toBe("review");
    expect(t.recorded[0]).toMatchObject({ outcome: "review", reason: "timeout" });
  });

  it("stays pending, and does not claim a verdict, when the answer is dropped because the handle changed", async () => {
    const t = setup({ record: async () => false });
    expect(await moderateSaved("h-9", "StuckOne", t.deps)).toBe("pending");
    expect(t.lines).toEqual([]);
  });
});
