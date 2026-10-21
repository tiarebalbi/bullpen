/** The order states and the only moves between them (ADR-0017). Pure: the database enforces the same table with conditional updates. */
export const ORDER_STATES = ["accepted", "working", "partially_filled", "cancel_requested", "cancelled", "filled", "rejected"] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  accepted: ["working", "rejected", "cancel_requested", "partially_filled", "filled"],
  working: ["partially_filled", "filled", "cancel_requested"],
  partially_filled: ["partially_filled", "filled", "cancel_requested"],
  cancel_requested: ["cancel_requested", "cancelled", "filled"],
  cancelled: ["cancelled", "filled"],
  filled: [],
  rejected: [],
};

export const canTransition = (from: OrderState, to: OrderState): boolean => TRANSITIONS[from].includes(to);

/** States in which the order still has work for the venue or the sweep. */
export const OPEN_STATES: readonly OrderState[] = ["accepted", "working", "partially_filled", "cancel_requested"];
export const isOpen = (state: OrderState): boolean => OPEN_STATES.includes(state);

/** Which bucket of the quantity a fill consumes: a cancelled order's late fill comes out of what the cancel gave up. */
export const fillBucket = (state: OrderState): "open" | "cancelled" | null => (state === "cancelled" ? "cancelled" : state === "filled" || state === "rejected" ? null : "open");

/**
 * The state after a fill is booked, given the buckets after it. A cancel that has not taken effect stays
 * cancel_requested while it is not yet filled; a cancelled order stays cancelled until its late fills bring
 * the cancelled quantity to zero.
 */
export function stateAfterFill(state: OrderState, after: { open: number; cancelled: number }): OrderState {
  switch (state) {
    case "accepted":
    case "working":
    case "partially_filled":
      return after.open === 0 ? "filled" : "partially_filled";
    case "cancel_requested":
      return after.open === 0 ? "filled" : "cancel_requested";
    case "cancelled":
      return after.cancelled === 0 ? "filled" : "cancelled";
    default:
      throw new Error(`a fill cannot be booked on a ${state} order`);
  }
}
