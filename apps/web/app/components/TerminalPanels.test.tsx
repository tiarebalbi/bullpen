import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccountView, OrderEventView, OrderView } from "@bullpen/contracts";
import { ActiveOrderPanel } from "./ActiveOrder.js";
import { Positions } from "./Positions.js";
import { RecentFills } from "./RecentFills.js";
import { AvatarSlot, HeaderFigures } from "./Terminal.js";

const order = (over: Partial<OrderView> = {}): OrderView => ({
  orderId: "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11", symbol: "NVDA", side: "buy", type: "market", state: "working", quantity: "10.00000000", filledQty: "0.00000000", openQty: "10.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "190.00000000", reserved: "1900.00000000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null, createdAt: "2026-10-20T10:00:00.000Z", cancelRequestedAt: null, ...over,
});
const events: OrderEventView[] = [
  { kind: "accepted", at: "2026-10-20T10:00:00.000Z", state: "accepted", quantity: "10.00000000", price: null },
  { kind: "working", at: "2026-10-20T10:00:01.000Z", state: "working", quantity: null, price: null },
];
const view = (over: Partial<AccountView> = {}): AccountView => ({
  label: "Player 4F2A", buyingPower: "98000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: "2026-10-20T10:00:00.000Z", ...over,
});

describe("Positions", () => {
  it("draws qty, average cost, last, value and P/L against cost, with cash and buying power in the header", () => {
    render(<Positions view={view({ positions: [{ symbol: "NVDA", quantity: "40.00000000", avgCost: "176.20000000", price: "182.58000000", value: "7303.20000000" }] })} />);
    expect(screen.getByText(/Cash \$100,000\.00 · Buying power \$98,000\.00/)).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /NVDA/ });
    expect(row).toHaveTextContent("40");
    expect(row).toHaveTextContent("$176.20");
    expect(row).toHaveTextContent("$182.58");
    expect(row).toHaveTextContent("$7,303.20");
    expect(row).toHaveTextContent("+$255.20");
    expect(row).toHaveTextContent("+3.62%");
  });
  it("says 'No positions yet' with none, and shows a dash rather than a made-up P/L without a price", () => {
    const { unmount } = render(<Positions view={view()} />);
    expect(screen.getByText("No positions yet")).toBeInTheDocument();
    unmount();
    render(<Positions view={view({ positions: [{ symbol: "V", quantity: "1.00000000", avgCost: "300.00000000", price: null, value: null }] })} />);
    expect(screen.getByText("No price")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^V/ })).toHaveTextContent("—");
  });
});

describe("the active order panel", () => {
  it("has an empty state before the first order", () => {
    render(<ActiveOrderPanel view={view()} refresh={() => undefined} confirming={false} onConfirming={() => undefined} />);
    expect(screen.getByText("No active order")).toBeInTheDocument();
  });
  it("draws the step line from the events, with Cancel while the order can still be cancelled", () => {
    const o = order();
    render(<ActiveOrderPanel view={view({ orders: [o], latestOrder: { orderId: o.orderId, events } })} refresh={() => undefined} confirming={false} onConfirming={() => undefined} />);
    const steps = screen.getByRole("list", { name: "Order steps" });
    expect(steps).toHaveTextContent("Reserve");
    expect(steps).toHaveTextContent("$1,900.00 set aside");
    expect(steps).toHaveTextContent("Sent");
    expect(steps).toHaveTextContent("Fills");
    expect(steps).toHaveTextContent("Settled");
    expect(screen.getByRole("button", { name: /Cancel order/ })).toBeInTheDocument();
  });
  it("'cancel requested' reads differently from 'cancelled', and offers no second Cancel", () => {
    const requested = order({ state: "cancel_requested", cancelRequestedAt: "2026-10-20T10:01:00.000Z" });
    const { unmount } = render(<ActiveOrderPanel view={view({ orders: [requested], latestOrder: { orderId: requested.orderId, events } })} refresh={() => undefined} confirming={false} onConfirming={() => undefined} />);
    expect(screen.getByText(/Cancel requested…/, { selector: ".bp-state" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel order/ })).not.toBeInTheDocument();
    unmount();
    const done = order({ state: "cancelled", releaseDone: true, released: "1900.00000000", cancelledQty: "10.00000000", openQty: "0.00000000" });
    render(<ActiveOrderPanel view={view({ orders: [done], latestOrder: { orderId: done.orderId, events } })} refresh={() => undefined} confirming={false} onConfirming={() => undefined} />);
    expect(screen.getByText("Cancelled", { selector: ".bp-state" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel order/ })).not.toBeInTheDocument();
  });
  it("the confirm step keeps the order unless told to cancel", () => {
    const o = order();
    const onConfirming = vi.fn();
    render(<ActiveOrderPanel view={view({ orders: [o], latestOrder: { orderId: o.orderId, events } })} refresh={() => undefined} confirming onConfirming={onConfirming} />);
    expect(screen.getByRole("alertdialog", { name: "Confirm cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onConfirming).toHaveBeenCalledWith(false);
  });
});

describe("recent fills", () => {
  it("says nothing filled yet, then lists time, side, quantity, symbol and price", () => {
    const { unmount } = render(<RecentFills view={view()} />);
    expect(screen.getByText("Nothing filled yet")).toBeInTheDocument();
    unmount();
    render(<RecentFills view={view({ fills: [{ fillId: "f1", symbol: "AAPL", side: "buy", quantity: "20.00000000", price: "236.10000000", executedAt: "2026-10-20T10:00:00.000Z" }] })} />);
    const line = screen.getByRole("list", { name: "Recent fills" });
    expect(line).toHaveTextContent("Buy 20 AAPL");
    expect(line).toHaveTextContent("@ $236.10");
  });
});

describe("the header", () => {
  it("shows equity and rank only when given them", () => {
    const { container, rerender } = render(<HeaderFigures equity={null} rank={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<HeaderFigures equity="100000.00000000" rank="#2 of 9" />);
    expect(screen.getByText("$100,000.00")).toBeInTheDocument();
    expect(screen.getByText("#2 of 9")).toBeInTheDocument();
    rerender(<HeaderFigures equity="100000.00000000" rank={null} />);
    expect(screen.queryByText("Rank")).not.toBeInTheDocument();
  });
  it("the avatar slot shows the neutral Player label and nothing else", () => {
    render(<AvatarSlot label="Player 4F2A" />);
    expect(screen.getByRole("img", { name: "Signed in as Player 4F2A" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /github/i })).not.toBeInTheDocument();
  });
});
