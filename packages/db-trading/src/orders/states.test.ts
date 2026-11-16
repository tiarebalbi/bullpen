import { describe, expect, it } from "vitest";
import { ORDER_STATES, canTransition, fillBucket, isOpen, stateAfterFill, type OrderState } from "./states.js";

describe("order state transitions", () => {
  it("allows exactly the listed moves", () => {
    const allowed = new Set([
      "queued_for_open>accepted", "queued_for_open>rejected", "queued_for_open>cancelled",
      "accepted>working", "accepted>rejected", "accepted>cancel_requested", "accepted>partially_filled", "accepted>filled",
      "working>partially_filled", "working>filled", "working>cancel_requested",
      "partially_filled>partially_filled", "partially_filled>filled", "partially_filled>cancel_requested",
      "cancel_requested>cancel_requested", "cancel_requested>cancelled", "cancel_requested>filled",
      "cancelled>cancelled", "cancelled>filled",
    ]);
    for (const from of ORDER_STATES) for (const to of ORDER_STATES) expect(canTransition(from, to), `${from} > ${to}`).toBe(allowed.has(`${from}>${to}`));
  });

  it("never leaves filled or rejected", () => {
    for (const to of ORDER_STATES) {
      expect(canTransition("filled", to)).toBe(false);
      expect(canTransition("rejected", to)).toBe(false);
    }
  });

  it("cancel_requested is not cancelled: cancelled needs the venue's confirmation, and a fill keeps the order cancel_requested", () => {
    expect(stateAfterFill("cancel_requested", { open: 3, cancelled: 0 })).toBe("cancel_requested");
    expect(canTransition("working", "cancelled")).toBe(false);
    expect(canTransition("partially_filled", "cancelled")).toBe(false);
  });

  it("the remaining quantity filling before the cancel takes effect ends the order filled, not cancelled", () => {
    expect(stateAfterFill("cancel_requested", { open: 0, cancelled: 0 })).toBe("filled");
  });

  it("a late fill on a cancelled order is booked, and fills the order only when nothing is left cancelled", () => {
    expect(fillBucket("cancelled")).toBe("cancelled");
    expect(stateAfterFill("cancelled", { open: 0, cancelled: 2 })).toBe("cancelled");
    expect(stateAfterFill("cancelled", { open: 0, cancelled: 0 })).toBe("filled");
  });

  it("books no fill on a terminal order that cannot take one", () => {
    expect(fillBucket("filled")).toBeNull();
    expect(fillBucket("rejected")).toBeNull();
    expect(() => stateAfterFill("rejected" as OrderState, { open: 0, cancelled: 0 })).toThrow();
  });

  it("a queued order is open, takes no fill, and cannot be cancelled through the venue's cancel path", () => {
    expect(isOpen("queued_for_open")).toBe(true);
    expect(fillBucket("queued_for_open")).toBeNull();
    expect(() => stateAfterFill("queued_for_open", { open: 0, cancelled: 0 })).toThrow();
    expect(canTransition("queued_for_open", "cancel_requested")).toBe(false);
    expect(canTransition("queued_for_open", "working")).toBe(false);
    expect(canTransition("queued_for_open", "filled")).toBe(false);
  });
});
