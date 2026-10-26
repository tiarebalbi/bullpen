import { describe, expect, it } from "vitest";
import { validateAccountView, validateOrderRequest, type AccountView, type OrderView } from "./orders.js";

const order: OrderView = {
  orderId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11",
  symbol: "AAPL",
  side: "buy",
  type: "market",
  state: "partially_filled",
  quantity: "10.00000000",
  filledQty: "4.00000000",
  openQty: "6.00000000",
  cancelledQty: "0.00000000",
  avgPrice: "100.00000000",
  capPrice: "105.00000000",
  reserved: "1050.00000000",
  spent: "400.00000000",
  released: "0.00000000",
  releaseDone: false,
  needsAttention: null,
  createdAt: "2026-10-21T12:00:00.000Z",
  cancelRequestedAt: null,
};
const view: AccountView = {
  label: "Player 4F2A",
  buyingPower: "98950.00000000",
  reserved: "650.00000000",
  cash: "99600.00000000",
  positionsValue: "400.00000000",
  equity: "100000.00000000",
  positions: [{ symbol: "AAPL", quantity: "4.00000000", avgCost: "99.00000000", price: "100.00000000", value: "400.00000000" }],
  orders: [order],
  latestOrder: {
    orderId: order.orderId,
    events: [
      { kind: "accepted", at: "2026-10-21T12:00:00.000Z", state: "accepted", quantity: "10.00000000", price: null },
      { kind: "working", at: "2026-10-21T12:00:01.000Z", state: "working", quantity: null, price: null },
      { kind: "fill", at: "2026-10-21T12:00:02.000Z", state: "partially_filled", quantity: "4.00000000", price: "100.00000000" },
    ],
  },
  fills: [{ fillId: `${order.orderId}:0`, symbol: "AAPL", side: "buy", quantity: "4.00000000", price: "100.00000000", executedAt: "2026-10-21T12:00:02.000Z" }],
  asOf: "2026-10-21T12:00:01.000Z",
};

describe("the account view contract", () => {
  it("accepts a real-shaped account, and one with nothing in it", () => {
    expect(validateAccountView(view)).toEqual({ valid: true, errors: null });
    expect(validateAccountView({ ...view, positions: [], orders: [], reserved: "0", positionsValue: "0" }).valid).toBe(true);
  });

  it("refuses a field that would name a person: an owner id, a login, an email", () => {
    for (const extra of [{ ownerUserId: "u1" }, { login: "octocat" }, { email: "a@b.c" }]) expect(validateAccountView({ ...view, ...extra }).valid).toBe(false);
    expect(validateAccountView({ ...view, orders: [{ ...order, accountId: "x" }] }).valid).toBe(false);
  });

  it("accepts no orders at all (latestOrder null, no fills) and refuses what would name a person in the history or the fills", () => {
    expect(validateAccountView({ ...view, orders: [], latestOrder: null, fills: [], positions: [] }).valid).toBe(true);
    expect(validateAccountView({ ...view, fills: [{ ...view.fills[0]!, accountId: "x" }] }).valid).toBe(false);
    expect(validateAccountView({ ...view, latestOrder: { ...view.latestOrder!, events: [{ ...view.latestOrder!.events[0]!, detail: {} }] } }).valid).toBe(false);
  });

  it("holds at most ten fills, and an event kind the screen does not draw is refused", () => {
    expect(validateAccountView({ ...view, fills: Array.from({ length: 11 }, () => view.fills[0]) }).valid).toBe(false);
    expect(validateAccountView({ ...view, latestOrder: { ...view.latestOrder!, events: [{ ...view.latestOrder!.events[0]!, kind: "fill_anomaly" }] } }).valid).toBe(false);
  });

  it("refuses a label that is a name, and a state the lifecycle does not have", () => {
    expect(validateAccountView({ ...view, label: "tbalbi" }).valid).toBe(false);
    expect(validateAccountView({ ...view, orders: [{ ...order, state: "pending" }] }).valid).toBe(false);
  });

  it("refuses money that is not a decimal string, a missing field and a number where a string belongs", () => {
    expect(validateAccountView({ ...view, buyingPower: 98950 }).valid).toBe(false);
    expect(validateAccountView({ ...view, equity: "1e5" }).valid).toBe(false);
    const { cash: _cash, ...missing } = view;
    expect(validateAccountView(missing).valid).toBe(false);
  });

  it("a failing example, for the record: a booked order whose filled quantity arrives as a number is reported by name", () => {
    const result = validateAccountView({ ...view, orders: [{ ...order, filledQty: 4 }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toMatch(/filledQty/);
  });
});

describe("the order request contract", () => {
  const request = { symbol: "AAPL", quantity: "10", clientOrderId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11" };

  it("accepts a market buy with a fractional quantity", () => {
    expect(validateOrderRequest(request).valid).toBe(true);
    expect(validateOrderRequest({ ...request, quantity: "0.5" }).valid).toBe(true);
  });

  it("refuses a sell, a limit price, an unknown field and a missing key: Part 4 builds market buys only", () => {
    for (const extra of [{ side: "sell" }, { limitPrice: "100" }, { type: "limit" }, { accountId: "x" }]) expect(validateOrderRequest({ ...request, ...extra }).valid).toBe(false);
    const { clientOrderId: _key, ...missing } = request;
    expect(validateOrderRequest(missing).valid).toBe(false);
  });

  it("refuses a zero, negative, too precise or not-a-number quantity, a lower-case symbol and a key that is not a uuid", () => {
    for (const quantity of ["0", "0.0", "-1", "1.123456789", "ten", "", "1e3"]) expect(validateOrderRequest({ ...request, quantity }).valid, quantity).toBe(false);
    expect(validateOrderRequest({ ...request, symbol: "aapl" }).valid).toBe(false);
    expect(validateOrderRequest({ ...request, clientOrderId: "not-a-uuid" }).valid).toBe(false);
  });
});
