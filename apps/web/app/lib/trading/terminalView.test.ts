import { describe, expect, it } from "vitest";
import type { AccountView, LeaderboardSnapshot, OrderEventView, OrderView } from "@bullpen/contracts";
import { activeOrder, approvedHandleOf, changeVsPreviousClose, fillLine, heldLabel, ownRow, positionLine, rankLabel, timelineSteps } from "./terminalView.js";

const order = (over: Partial<OrderView> = {}): OrderView => ({
  orderId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11", symbol: "AAPL", side: "buy", type: "market", state: "working", quantity: "10.00000000", filledQty: "0.00000000", openQty: "10.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "105.00000000", reserved: "1050.00000000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null, createdAt: "2026-10-20T10:00:00.000Z", cancelRequestedAt: null, ...over,
});
const ev = (kind: OrderEventView["kind"], at: string, state: OrderView["state"] | null = null, extra: Partial<OrderEventView> = {}): OrderEventView => ({ kind, at, state, quantity: null, price: null, ...extra });

describe("position lines: average cost and profit or loss", () => {
  it("is (last − average cost) × quantity, and a share of what was paid", () => {
    const line = positionLine({ symbol: "AAPL", quantity: "10.00000000", avgCost: "90.00000000", price: "100.00000000", value: "1000.00000000" });
    expect(line.pl).toBeCloseTo(100);
    expect(line.plPercent).toBeCloseTo((100 / 900) * 100);
  });
  it("is a loss when the last price is under the cost", () => {
    expect(positionLine({ symbol: "V", quantity: "2.00000000", avgCost: "300.00000000", price: "290.00000000", value: "580.00000000" }).pl).toBeCloseTo(-20);
  });
  it("is null, not zero, without a last price or without a cost", () => {
    expect(positionLine({ symbol: "X", quantity: "1.00000000", avgCost: "5.00000000", price: null, value: null })).toMatchObject({ pl: null, plPercent: null });
    expect(positionLine({ symbol: "X", quantity: "1.00000000", avgCost: null, price: "5.00000000", value: "5.00000000" })).toMatchObject({ pl: null, plPercent: null });
  });
});

describe("held", () => {
  const positions = [{ symbol: "AAPL", quantity: "30.00000000", avgCost: "1.00000000", price: null, value: null }];
  it("reads 'N held' from positions, without trailing zeros, and says nothing for a symbol not held", () => {
    expect(heldLabel(positions, "AAPL")).toBe("30 held");
    expect(heldLabel(positions, "MSFT")).toBeNull();
  });
});

describe("rank visibility", () => {
  const snapshot = (rows: Array<{ handle: string; rank: number }>, total: number): LeaderboardSnapshot => ({
    rows: rows.map((r) => ({ accountId: "a", cash: "0", positionsValue: "0", equity: "0", ...r })), total, asOf: "2026-10-20T10:00:00.000Z", ageMs: 0, stale: false, lastFailure: null,
  });
  it("shows '#n of N' once the player has a row", () => {
    expect(rankLabel(snapshot([{ handle: "Player 1111", rank: 1 }, { handle: "Player 4F2A", rank: 7 }], 12), "Player 4F2A")).toBe("#7 of 12");
  });
  it("is hidden until the player is ranked, while the board loads, or with no account", () => {
    expect(rankLabel(snapshot([{ handle: "Player 1111", rank: 1 }], 12), "Player 4F2A")).toBeNull();
    expect(rankLabel(null, "Player 4F2A")).toBeNull();
    expect(rankLabel(snapshot([{ handle: "Player 4F2A", rank: 1 }], 1), null)).toBeNull();
    expect(rankLabel(snapshot([], 0), "Player 4F2A")).toBeNull();
  });
  it("finds the player by their account once their handle is approved, when the row no longer carries the neutral label", () => {
    const withViewer: LeaderboardSnapshot = { ...snapshot([{ handle: "ada", rank: 3 }], 9), viewer: { accountId: "a", handle: { status: "approved", approved: "ada" } } };
    expect(rankLabel(withViewer, "Player 4F2A")).toBe("#3 of 9");
    expect(ownRow(withViewer, "Player 4F2A")).toMatchObject({ handle: "ada", rank: 3 });
  });
  it("does not take another player's row for the viewer's, even when their label matches", () => {
    const other: LeaderboardSnapshot = { ...snapshot([{ handle: "Player 4F2A", rank: 1 }], 1), viewer: { accountId: "someone-else", handle: null } };
    expect(rankLabel(other, "Player 4F2A")).toBeNull();
  });
});

describe("the approved handle the avatar takes its initials from", () => {
  const board = (viewer: LeaderboardSnapshot["viewer"]): LeaderboardSnapshot => ({ rows: [], total: 0, asOf: "2026-10-20T10:00:00.000Z", ageMs: 0, stale: false, lastFailure: null, ...(viewer ? { viewer } : {}) });
  it("is the player's own handle once it is approved", () => {
    expect(approvedHandleOf(board({ accountId: "a", handle: { status: "approved", approved: "ada" } }))).toBe("ada");
  });
  it("is nothing for a visitor, for no handle, for a handle in review or rejected, or while the ranking loads", () => {
    expect(approvedHandleOf(board(undefined))).toBeNull();
    expect(approvedHandleOf(board({ accountId: "a", handle: null }))).toBeNull();
    expect(approvedHandleOf(board({ accountId: "a", handle: { status: "review", approved: null } }))).toBeNull();
    expect(approvedHandleOf(board({ accountId: "a", handle: { status: "rejected", approved: null } }))).toBeNull();
    expect(approvedHandleOf(null)).toBeNull();
  });
});

describe("change against the previous close", () => {
  it("is computed only when both closes are stored", () => {
    expect(changeVsPreviousClose({ price: "110", previousClose: { price: "100", asOf: "2026-10-12T20:00:00.000Z" } })).toEqual({ percent: 10, up: true });
    expect(changeVsPreviousClose({ price: "90", previousClose: { price: "100", asOf: "2026-10-12T20:00:00.000Z" } })).toEqual({ percent: -10, up: false });
  });
  it("is null with one close stored, and with a previous close that cannot be divided by", () => {
    expect(changeVsPreviousClose({ price: "110", previousClose: null })).toBeNull();
    expect(changeVsPreviousClose({ price: "110", previousClose: { price: "0", asOf: "2026-10-12T20:00:00.000Z" } })).toBeNull();
  });
});

describe("the order timeline, from events", () => {
  const accepted = ev("accepted", "2026-10-20T10:00:00.000Z", "accepted", { quantity: "10.00000000" });
  const working = ev("working", "2026-10-20T10:00:01.000Z", "working");
  const status = (steps: ReturnType<typeof timelineSteps>) => steps.map((s) => `${s.key}:${s.status}`).join(" ");

  it("an accepted order has reserved and has not been sent", () => {
    expect(status(timelineSteps(order({ state: "accepted" }), [accepted]))).toBe("reserve:done sent:active fills:pending end:pending");
  });
  it("a working order has been sent and is waiting for fills", () => {
    expect(status(timelineSteps(order(), [accepted, working]))).toBe("reserve:done sent:done fills:active end:pending");
  });
  it("a partial fill says how much, and the step stays active", () => {
    const steps = timelineSteps(order({ state: "partially_filled", filledQty: "4.00000000", openQty: "6.00000000" }), [accepted, working, ev("fill", "2026-10-20T10:00:02.000Z", "partially_filled", { quantity: "4.00000000", price: "100" })]);
    expect(steps[2]).toMatchObject({ status: "active", sub: "4 of 10 filled", at: "2026-10-20T10:00:02.000Z" });
  });
  it("a filled order settles once the reserve is released, and says so before it is", () => {
    const filled = order({ state: "filled", filledQty: "10.00000000", openQty: "0.00000000", spent: "1000.00000000" });
    const events = [accepted, working, ev("fill", "2026-10-20T10:00:02.000Z", "filled", { quantity: "10.00000000", price: "100" })];
    expect(status(timelineSteps(filled, events))).toBe("reserve:done sent:done fills:done end:active");
    const settled = timelineSteps({ ...filled, releaseDone: true, released: "50.00000000" }, [...events, ev("released", "2026-10-20T10:00:03.000Z")]);
    expect(status(settled)).toBe("reserve:done sent:done fills:done end:done");
    expect(settled[3]).toMatchObject({ label: "Settled", sub: "$50.00 back in buying power" });
  });
  it("'cancel requested' is not 'cancelled': the request stops the fills step but the end step is still pending", () => {
    const steps = timelineSteps(order({ state: "cancel_requested", cancelRequestedAt: "2026-10-20T10:01:00.000Z" }), [accepted, working, ev("cancel_requested", "2026-10-20T10:01:00.000Z", "cancel_requested")]);
    expect(steps[2]).toMatchObject({ status: "stopped" });
    expect(steps[2]!.sub).toMatch(/^Cancel requested…/);
    expect(steps[3]).toMatchObject({ label: "Settled", status: "pending" });
  });
  it("a cancelled order ends as 'Cancelled', and 'Released' is for a refusal", () => {
    const cancelled = timelineSteps(order({ state: "cancelled", cancelledQty: "10.00000000", openQty: "0.00000000", releaseDone: true, released: "1050.00000000" }), [accepted, working, ev("cancelled", "2026-10-20T10:01:05.000Z", "cancelled")]);
    expect(cancelled[3]).toMatchObject({ label: "Cancelled", status: "done", at: "2026-10-20T10:01:05.000Z" });
    const refused = timelineSteps(order({ state: "rejected", releaseDone: true, released: "1050.00000000" }), [accepted, ev("rejected", "2026-10-20T10:00:01.000Z", "rejected")]);
    expect(refused[3]).toMatchObject({ label: "Released", status: "done" });
    expect(refused[2]!.sub).toBe("The venue refused it");
  });
});

describe("recent fills and the active order", () => {
  it("a fill is a line of time, side, quantity, symbol and price", () => {
    const line = fillLine({ fillId: "f", symbol: "AAPL", side: "buy", quantity: "20.00000000", price: "236.10000000", executedAt: "2026-10-20T10:00:00.000Z" });
    expect(line).toMatchObject({ side: "Buy", quantity: "20", symbol: "AAPL", price: "236.10" });
    expect(line.time).toMatch(/^\d\d:\d\d:\d\d$/);
  });
  it("a crypto fill drops the quote currency and keeps its decimals, with a grouped price, as the design writes it", () => {
    const line = fillLine({ fillId: "f", symbol: "BTC-USD", side: "buy", quantity: "0.25000000", price: "108900.00000000", executedAt: "2026-10-20T10:00:00.000Z" });
    expect(line).toMatchObject({ quantity: "0.25", symbol: "BTC", price: "108,900.00" });
  });
  it("shows the stored quantity exactly, with trailing zeros trimmed and nothing rounded, for a stock and for crypto", () => {
    const quantity = (symbol: string, stored: string) => fillLine({ fillId: "f", symbol, side: "buy", quantity: stored, price: "100.00000000", executedAt: "2026-10-20T10:00:00.000Z" }).quantity;
    expect(quantity("AAPL", "200.00000000")).toBe("200");
    expect(quantity("AAPL", "3")).toBe("3");
    expect(quantity("BTC-USD", "0.25000000")).toBe("0.25");
    expect(quantity("BTC-USD", "0.12345678")).toBe("0.12345678");
    expect(quantity("BTC-USD", "2.00000000")).toBe("2");
    expect(quantity("ETH-USD", "0.00000001")).toBe("0.00000001");
  });
  it("a stock fill booked with a fraction shows that fraction: it is never rounded to a whole share to hide it", () => {
    const quantity = (stored: string) => fillLine({ fillId: "f", symbol: "GOOGL", side: "buy", quantity: stored, price: "196.11000000", executedAt: "2026-10-20T10:00:00.000Z" }).quantity;
    expect(quantity("116.83359884")).toBe("116.83359884");
    expect(quantity("83.16640116")).toBe("83.16640116");
    expect(quantity("0.50000000")).toBe("0.5");
    // whatever a stored quantity is, what is drawn is the same number: no digit is lost
    for (const stored of ["1.00000001", "199.99999999", "116.83359884", "0.00000001", "20.50000000"]) expect(Number(quantity(stored))).toBe(Number(stored));
  });
  it("the active order is the latest order with its own events, and nothing before the first order", () => {
    const o = order();
    const view = { orders: [o], latestOrder: { orderId: o.orderId, events: [] } } as unknown as AccountView;
    expect(activeOrder(view)?.order.orderId).toBe(o.orderId);
    expect(activeOrder({ orders: [], latestOrder: null } as unknown as AccountView)).toBeNull();
  });
});

describe("what Esc may cancel", () => {
  it("is the latest order's id while it is open and not yet asked to cancel, and null otherwise", async () => {
    const { cancellableOrderId } = await import("./terminalView.js");
    const o = order();
    const view = (state: OrderView["state"]) => ({ orders: [{ ...o, state }], latestOrder: { orderId: o.orderId, events: [] } }) as unknown as AccountView;
    expect(cancellableOrderId(view("working"))).toBe(o.orderId);
    for (const state of ["cancel_requested", "cancelled", "filled", "rejected"] as const) expect(cancellableOrderId(view(state))).toBeNull();
    expect(cancellableOrderId(null)).toBeNull();
  });
});
