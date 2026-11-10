import { describe, expect, it } from "vitest";
import { SimulatedVenue, partialSize, seeded, type PriceKind, type PriceSource } from "./venue.js";

const UNIT = 100_000_000n;
const prices = (kind: PriceKind): PriceSource => ({ latest: async () => ({ price: "100.00", asOf: new Date(), stale: false, kind }) });

/** Every fill the simulator makes for one order, polled until the order is done. */
async function fillsOf(kind: PriceKind, quantity: string, seed: number): Promise<string[]> {
  const venue = new SimulatedVenue({ seed, prices: prices(kind), partialRate: 1 });
  const now = new Date();
  await venue.place({ orderId: "o", symbol: kind === "end-of-day" ? "GOOGL" : "BTC-USD", quantity, capPrice: "1000000" }, now);
  const sizes: string[] = [];
  for (let i = 0; i < 500; i += 1) {
    const events = await venue.poll(now);
    for (const event of events) if (event.kind === "fill") sizes.push(event.fill.quantity);
    if (events.length === 0) break;
  }
  return sizes;
}

const units = (decimal: string): bigint => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(8, "0").slice(0, 8));
};

describe("a stock fills in whole shares", () => {
  it("every fill of a 200-share order is a whole number of shares, and the parts add up to the order", async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const sizes = await fillsOf("end-of-day", "200", seed);
      expect(sizes.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      for (const size of sizes) expect(units(size) % UNIT, `seed ${seed}: ${size}`).toBe(0n);
      expect(sizes.reduce((sum, size) => sum + units(size), 0n), `seed ${seed}`).toBe(200n * UNIT);
    }
  });

  it("every stock fill is a whole number of shares and the parts sum to the order, for many order sizes and 40 seeds each", async () => {
    for (const quantity of ["2", "3", "7", "13", "50", "200", "999", "1000"]) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const sizes = await fillsOf("end-of-day", quantity, seed * 7919);
        for (const size of sizes) expect(units(size) % UNIT, `${quantity} shares, seed ${seed * 7919}: ${size}`).toBe(0n);
        expect(sizes.reduce((sum, size) => sum + units(size), 0n), `${quantity} shares, seed ${seed * 7919}`).toBe(BigInt(quantity) * UNIT);
      }
    }
  });

  it("with every fill partial, a 200-share order still ends in more than one fill and never a fraction", async () => {
    const sizes = await fillsOf("end-of-day", "200", 7);
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.every((size) => /^\d+\.0{8}$/.test(size))).toBe(true);
  });

  it("one share fills in one go, and two shares may split into one and one", async () => {
    expect(await fillsOf("end-of-day", "1", 3)).toEqual(["1.00000000"]);
    const two = await fillsOf("end-of-day", "2", 3);
    expect(two.reduce((sum, size) => sum + units(size), 0n)).toBe(2n * UNIT);
    for (const size of two) expect(units(size) % UNIT).toBe(0n);
  });

  it("an order that is not whole (0.5 of a share) fills in one go, for what it is", async () => {
    expect(await fillsOf("end-of-day", "0.5", 3)).toEqual(["0.50000000"]);
  });
});

describe("a live price keeps its 1e-8 steps", () => {
  it("a crypto order can split into a fraction, and the parts still add up", async () => {
    const all = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const sizes = await fillsOf("live", "0.25", seed);
      expect(sizes.reduce((sum, size) => sum + units(size), 0n)).toBe(units("0.25"));
      sizes.forEach((size) => all.add(size));
    }
    expect([...all].some((size) => units(size) % UNIT !== 0n)).toBe(true);
  });
});

describe("partialSize", () => {
  it("is null when the draw says not partial, whatever the kind", () => {
    expect(partialSize(() => 0.99, 0.1, 200n * UNIT, "end-of-day")).toBeNull();
    expect(partialSize(() => 0.99, 0.1, 200n * UNIT, "live")).toBeNull();
  });

  it("is always strictly less than what is left, in whole shares for a stock", () => {
    const rng = seeded(11);
    for (let i = 0; i < 500; i += 1) {
      const remaining = BigInt(2 + Math.floor(rng() * 400)) * UNIT;
      const size = partialSize(rng, 1, remaining, "end-of-day");
      expect(size).not.toBeNull();
      expect(size! % UNIT).toBe(0n);
      expect(size!).toBeGreaterThanOrEqual(UNIT);
      expect(size!).toBeLessThan(remaining);
    }
  });
});
