import { describe, expect, it } from "vitest";
import { BYTES_PER_ROW, bytesPerRead, checkTransferBudget, estimateCell, estimateRun, type CellPlan } from "./transfer-budget.js";

const cell = (overrides: Partial<CellPlan> = {}): CellPlan => ({ label: "x", readers: 50, seconds: 15, writers: 8, readsPerSecondPerReader: 10, rowsPerRead: 51, ...overrides });

describe("the estimate of what a run moves", () => {
  it("prices a read by its rows: the cap of 51 is about ten kilobytes, the whole ranking of 2,000 is about 385", () => {
    expect(bytesPerRead(51)).toBeGreaterThan(9_000);
    expect(bytesPerRead(51)).toBeLessThan(11_000);
    expect(bytesPerRead(2000)).toBeGreaterThan(380_000);
    expect(bytesPerRead(2000)).toBeLessThan(400_000);
    expect(BYTES_PER_ROW).toBeGreaterThanOrEqual(172); // the measured size of a row, never below it
  });

  it("grows with readers and seconds, and a cell with no readers costs only its writes", () => {
    expect(estimateCell(cell({ readers: 50 })).bytes).toBeGreaterThan(estimateCell(cell({ readers: 10 })).bytes * 4);
    expect(estimateCell(cell({ seconds: 30 })).bytes).toBeCloseTo(estimateCell(cell({ seconds: 15 })).bytes * 2, -2);
    expect(estimateCell(cell({ readers: 0 })).bytes).toBeLessThan(estimateCell(cell({ readers: 1 })).bytes);
  });

  it("estimates the N = 50 cell of the 15-second plan at about 75 MB, the whole default run under 250 MB", () => {
    const plan = [0, 10, 10, 50, 50].map((readers) => cell({ readers }));
    const run = estimateRun(plan, 200);
    expect(estimateCell(cell()).bytes / 1e6).toBeGreaterThan(60);
    expect(estimateCell(cell()).bytes / 1e6).toBeLessThan(90);
    expect(run.total / 1e6).toBeLessThan(250);
    expect(run.total).toBe(run.setup + run.cells.reduce((sum, c) => sum + c.bytes, 0));
  });

  it("would have refused the run that used up the allowance: 2,000 rows a read, 30 seconds, against 5 GB", () => {
    const old = estimateCell(cell({ readers: 50, seconds: 30, rowsPerRead: 2000, readsPerSecondPerReader: 3.8 }));
    expect(old.bytes / 1e9).toBeGreaterThan(1.4); // measured: about 1.7 GB for a cell
    expect(checkTransferBudget(old.bytes, 5e9, 0.1).ok).toBe(false);
  });
});

describe("checkTransferBudget", () => {
  it("allows a run within its share of what remains", () => {
    expect(checkTransferBudget(100e6, 5e9, 0.1)).toMatchObject({ ok: true });
  });

  it("refuses a run past its share, and says by how much", () => {
    const decision = checkTransferBudget(600e6, 5e9, 0.1);
    expect(decision.ok).toBe(false);
    expect(decision.message).toContain("600.0 MB");
    expect(decision.message).toContain("500.0 MB");
  });

  it("refuses when the remainder is not given, is zero or is not a number, and says how to give it", () => {
    for (const remaining of [undefined, 0, -5, Number.NaN]) {
      const decision = checkTransferBudget(1, remaining, 0.1);
      expect(decision.ok).toBe(false);
      expect(decision.message).toContain("--remaining-mb");
    }
  });

  it("holds the share to the remainder: the same run passes against 5 GB and fails against 1 GB", () => {
    expect(checkTransferBudget(250e6, 5e9, 0.1).ok).toBe(true);
    expect(checkTransferBudget(250e6, 1e9, 0.1).ok).toBe(false);
  });
});
