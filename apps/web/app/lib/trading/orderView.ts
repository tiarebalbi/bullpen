import type { OrderState, OrderView } from "@bullpen/contracts";

/** The reserve a market buy holds above the last price (packages/db-trading CAP_MARGIN, 1.05). The ticket shows it as a ceiling, not a price. */
export const RESERVE_MARGIN = 1.05;

export type StateTone = "neutral" | "working" | "ok" | "pending" | "closed" | "refused";

export interface StateLook {
  /** The words on the badge. */
  label: string;
  /** A glyph that carries the meaning without colour. */
  glyph: string;
  tone: StateTone;
}

/** How each of the seven states reads. "Cancel requested" and "Cancelled" differ in words, glyph and tone: a request is not a cancel. */
export const STATE_LOOK: Record<OrderState, StateLook> = {
  accepted: { label: "Accepted", glyph: "○", tone: "neutral" },
  working: { label: "Working", glyph: "◐", tone: "working" },
  partially_filled: { label: "Partially filled", glyph: "◑", tone: "working" },
  cancel_requested: { label: "Cancel requested…", glyph: "⧖", tone: "pending" },
  cancelled: { label: "Cancelled", glyph: "✕", tone: "closed" },
  filled: { label: "Filled", glyph: "●", tone: "ok" },
  rejected: { label: "Rejected", glyph: "!", tone: "refused" },
};

export function stateLook(state: OrderState): StateLook {
  return STATE_LOOK[state];
}

/** An order that can still change, so that the screen keeps polling and offers Cancel. */
export const isOpenState = (state: OrderState): boolean => state === "accepted" || state === "working" || state === "partially_filled" || state === "cancel_requested";

/** Cancel is offered while the order can still be asked to stop: not once it is asked, and not once it is finished. */
export const canCancel = (state: OrderState): boolean => state === "accepted" || state === "working" || state === "partially_filled";

const trim = (decimal: string): string => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  const kept = fraction.replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
};
export const quantityLabel = (decimal: string): string => trim(decimal);

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatMoney = (decimal: string): string => money.format(Number(decimal));

/** The second line of an order: what is true of it now, from its own numbers. Never a guess about what comes next. */
export function orderDetail(o: OrderView): string {
  const filled = `${quantityLabel(o.filledQty)} of ${quantityLabel(o.quantity)} filled`;
  const average = o.avgPrice ? ` at ${formatMoney(o.avgPrice)}` : "";
  switch (o.state) {
    case "accepted":
      return `${formatMoney(o.reserved)} set aside. Waiting to reach the venue.`;
    case "working":
      return `${formatMoney(o.reserved)} set aside. At the venue, waiting for a price it can fill at.`;
    case "partially_filled":
      return `${filled}${average}. ${quantityLabel(o.openQty)} still open.`;
    case "cancel_requested":
      return `Waiting for the fill engine to confirm. ${filled}${average} so far, and it can still fill until it confirms.`;
    case "cancelled":
      return `${filled}${average}. ${o.releaseDone ? `${formatMoney(o.released)} back in buying power.` : "The unused money is still being released."}`;
    case "filled":
      return `${filled}${average}. ${o.releaseDone ? `${formatMoney(o.released)} of the reserve back in buying power.` : "The rest of the reserve is being released."}`;
    case "rejected":
      return `The venue refused it, and nothing was spent. ${o.releaseDone ? `${formatMoney(o.released)} back in buying power.` : "The reserve is being released."}`;
  }
}

/** A quantity the ticket will send: positive, at most 8 places. Anything else is not sent, and the ticket says why. */
export function parseQuantity(text: string): { ok: true; quantity: string } | { ok: false; why: string } {
  const value = text.trim();
  if (value === "") return { ok: false, why: "Enter a quantity." };
  if (!/^\d+(\.\d{1,8})?$/.test(value)) return { ok: false, why: "Use a number with at most 8 decimal places." };
  if (Number(value) <= 0) return { ok: false, why: "The quantity must be more than zero." };
  return { ok: true, quantity: value };
}

/** What a buy of `quantity` at `price` costs, and what it holds in reserve. Both are estimates until the fill. */
export function estimate(quantity: string, price: string): { cost: number; reserve: number } {
  const cost = Number(quantity) * Number(price);
  return { cost, reserve: cost * RESERVE_MARGIN };
}

/** The key for one attempt: a retry of the same attempt reuses it, and a new attempt gets a new one. */
export function newAttemptKey(): string {
  return globalThis.crypto.randomUUID();
}
