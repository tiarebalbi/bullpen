import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHandle } from "./rules.js";
import { TARGETS, compareToTargets, lowestSafeThreshold, parseLabelled, percentile, spread, summarize, thresholdTable, type Measured } from "./measure.js";

const ok = (probability: number, latencyMs = 100, costUsd: number | null = 0.00002) => ({ ok: true as const, probability, costUsd, latencyMs });
const fail = (latencyMs = 2000) => ({ ok: false as const, reason: "timeout" as const, latencyMs });
const item = (handle: string, label: "clean" | "reject", result: Measured["result"]): Measured => ({ id: `${label}-${handle}`, handle, label, result });

describe("percentile", () => {
  it("is the nearest rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile(values, 0)).toBe(10);
    expect(percentile([5], 95)).toBe(5);
  });

  it("does not depend on the order, and is NaN for nothing", () => {
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(percentile([], 50)).toBeNaN();
  });

  it("describes a spread", () => {
    expect(spread([0.1, 0.9, 0.5])).toMatchObject({ count: 3, min: 0.1, median: 0.5, max: 0.9 });
  });
});

describe("summarising a run", () => {
  const run: Measured[] = [
    item("a", "clean", ok(0.99, 100)),
    item("b", "clean", ok(0.95, 200)),
    item("c", "clean", ok(0.6, 300)),
    item("d", "clean", fail(2000)),
    item("x", "reject", ok(0.05, 150)),
    item("y", "reject", ok(0.97, 250)),
  ];

  it("counts rejects approved and clean sent to review with the product's own verdict, failures included", () => {
    const s = summarize(run, 0.9);
    expect(s.rejectsApproved).toEqual(["reject-y"]);
    expect(s.cleanToReview).toEqual({ count: 2, share: 0.5, failures: 1, ids: ["clean-c", "clean-d"] });
    expect(s.failures).toBe(1);
  });

  it("a probability exactly at the threshold is review, not approved", () => {
    const s = summarize([item("a", "clean", ok(0.9)), item("x", "reject", ok(0.9))], 0.9);
    expect(s.cleanToReview.count).toBe(1);
    expect(s.rejectsApproved).toEqual([]);
  });

  it("reports latency over every call and cost over the calls that returned one", () => {
    const s = summarize(run, 0.9);
    expect(s.latencyMs).toEqual({ p50: 200, p95: 2000, max: 2000 });
    expect(s.costPerDecisionUsd).toBeCloseTo(0.00002, 10);
    expect(summarize([item("a", "clean", ok(0.9, 1, null))], 0.5).costPerDecisionUsd).toBeNull();
  });

  it("compares to the targets and says plainly which are missed", () => {
    const verdicts = compareToTargets(summarize(run, 0.9));
    expect(verdicts.map((v) => v.met)).toEqual([false, false, false, true]);
    expect(verdicts[0]).toMatchObject({ target: "0 rejects accepted", actual: "1 of 2" });
    expect(TARGETS.p95LatencyMs).toBe(500);
  });

  it("gives every handle a stable id, so a run can name a reject without printing it", () => {
    const ids = parseLabelled("a\nb\n", "clean").map((h) => h.id);
    expect(ids).toEqual(["clean-001", "clean-002"]);
  });

  it("does not call a missing cost a pass", () => {
    const verdicts = compareToTargets(summarize([item("a", "clean", ok(0.99, 10, null)), item("x", "reject", ok(0.1, 10, null))], 0.9));
    expect(verdicts[3]).toMatchObject({ met: null, actual: "no cost field in the answers" });
  });

  it("finds the lowest threshold that approves no reject, and tabulates the trade", () => {
    expect(lowestSafeThreshold(run)).toBe(0.97);
    expect(lowestSafeThreshold([item("a", "clean", ok(0.9))])).toBeNull();
    expect(thresholdTable(run, [0.5, 0.97, 0.99])).toEqual([
      { threshold: 0.5, rejectsApproved: 1, cleanToReview: 1 },
      { threshold: 0.97, rejectsApproved: 0, cleanToReview: 3 },
      { threshold: 0.99, rejectsApproved: 0, cleanToReview: 4 },
    ]);
  });
});

describe("the labelled set", () => {
  const dir = join(import.meta.dirname, "..", "..", "..", "moderation-set");
  const clean = parseLabelled(readFileSync(join(dir, "clean.txt"), "utf8"), "clean");
  const reject = parseLabelled(readFileSync(join(dir, "reject.txt"), "utf8"), "reject");

  it("has about 100 clean handles and 40 that must be rejected", () => {
    expect(clean.length).toBeGreaterThanOrEqual(95);
    expect(clean.length).toBeLessThanOrEqual(110);
    expect(reject).toHaveLength(40);
  });

  it("has no handle twice, ignoring case, across both files", () => {
    const names = [...clean, ...reject].map((h) => h.handle.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every reject a known category", () => {
    for (const h of reject) expect(["insult", "slur", "threat", "sexual", "impersonation"]).toContain(h.category);
  });

  it("meets the form rules for every clean handle, and for every reject except the bracketed slur placeholders", () => {
    for (const h of clean) expect(checkHandle(h.handle).ok, h.handle).toBe(true);
    const failing = reject.filter((h) => !checkHandle(h.handle).ok);
    expect(failing.every((h) => h.category === "slur" && /[[\]]/.test(h.handle))).toBe(true);
  });

  it("contains no email address and no @-name", () => {
    for (const text of ["clean.txt", "reject.txt", "README.md"]) expect(readFileSync(join(dir, text), "utf8")).not.toMatch(/\S+@\S+/);
  });
});

describe("parsing", () => {
  it("skips comments and blank lines and reads a category after a tab", () => {
    expect(parseLabelled("# note\n\nabc\tinsult\r\nxyz\tthreat\n", "reject")).toEqual([
      { id: "reject-001", handle: "abc", label: "reject", category: "insult" },
      { id: "reject-002", handle: "xyz", label: "reject", category: "threat" },
    ]);
  });
});
