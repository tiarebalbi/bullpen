import { describe, expect, it } from "vitest";
import type { OrderView } from "@bullpen/contracts";
import { STATE_LOOK, canCancel, estimate, isOpenState, orderDetail, parseQuantity, stateLook } from "./orderView.js";

const order = (over: Partial<OrderView>): OrderView => ({
  orderId: "o1", symbol: "AAPL", side: "buy", type: "market", state: "accepted", quantity: "10.00000000", filledQty: "0.00000000", openQty: "10.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "105.00000000", reserved: "1050.00000000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null,
  createdAt: "2026-10-20T10:00:00.000Z", cancelRequestedAt: null, ...over,
});

describe("the seven states", () => {
  it("each has its own label and glyph", () => {
    const states = Object.keys(STATE_LOOK) as (keyof typeof STATE_LOOK)[];
    expect(states).toHaveLength(7);
    expect(new Set(states.map((s) => STATE_LOOK[s].label)).size).toBe(7);
    expect(new Set(states.map((s) => STATE_LOOK[s].glyph)).size).toBe(7);
  });

  it("'cancel requested' differs from 'cancelled' in words, glyph and tone, and says it is waiting", () => {
    expect(stateLook("cancel_requested")).not.toEqual(stateLook("cancelled"));
    expect(stateLook("cancel_requested").tone).not.toBe(stateLook("cancelled").tone);
    expect(orderDetail(order({ state: "cancel_requested" }))).toMatch(/Waiting for the fill engine to confirm/);
    expect(orderDetail(order({ state: "cancel_requested" }))).not.toMatch(/back in buying power/);
  });

  it("only an order that can change is open, and only one not yet asked to stop can be cancelled", () => {
    expect((["accepted", "working", "partially_filled", "cancel_requested"] as const).every(isOpenState)).toBe(true);
    expect((["cancelled", "filled", "rejected"] as const).some(isOpenState)).toBe(false);
    expect(canCancel("cancel_requested")).toBe(false);
    expect(canCancel("working")).toBe(true);
    expect(canCancel("filled")).toBe(false);
  });
});

describe("what an order says about itself", () => {
  it("a cancelled order shows what filled and what came back, and says when the release is not done", () => {
    const done = orderDetail(order({ state: "cancelled", filledQty: "4.00000000", avgPrice: "100.00000000", releaseDone: true, released: "650.00000000" }));
    expect(done).toBe("4 of 10 filled at $100.00. $650.00 back in buying power.");
    expect(orderDetail(order({ state: "cancelled", releaseDone: false }))).toMatch(/still being released/);
  });
  it("a partial fill shows what is still open, a rejection shows nothing was spent", () => {
    expect(orderDetail(order({ state: "partially_filled", filledQty: "4.00000000", openQty: "6.00000000", avgPrice: "100.00000000" }))).toBe("4 of 10 filled at $100.00. 6 still open.");
    expect(orderDetail(order({ state: "rejected", releaseDone: true, released: "1050.00000000" }))).toMatch(/nothing was spent.*\$1,050\.00 back/);
  });
});

describe("the quantity the ticket sends", () => {
  it.each([["10", true], ["0.5", true], ["0.12345678", true], ["", false], ["0", false], ["-1", false], ["1e3", false], ["0.123456789", false], ["abc", false]])("%j -> %s", (text, ok) => {
    expect(parseQuantity(text).ok).toBe(ok);
  });
  it("estimates the cost and the 5% reserve", () => {
    expect(estimate("10", "100")).toEqual({ cost: 1000, reserve: 1050 });
  });
});

describe("the ticket's stepper and button words", () => {
  it("steps a whole unit at a time and never below nothing", async () => {
    const { stepQuantity } = await import("./orderView.js");
    expect(stepQuantity("", 1)).toBe("1");
    expect(stepQuantity("10", 1)).toBe("11");
    expect(stepQuantity("10", -1)).toBe("9");
    expect(stepQuantity("1", -1)).toBe("");
    expect(stepQuantity("", -1)).toBe("");
    expect(stepQuantity("abc", 1)).toBe("1");
    expect(stepQuantity("2.5", 1)).toBe("3.5");
  });
  it("the button says what it will do once the quantity is valid", async () => {
    const { buyLabel } = await import("./orderView.js");
    expect(buyLabel("NVDA", "10.00000000", 1825.8)).toBe("Buy 10 NVDA · $1,825.80");
    expect(buyLabel("NVDA", null, null)).toBe("Buy NVDA");
  });
});
