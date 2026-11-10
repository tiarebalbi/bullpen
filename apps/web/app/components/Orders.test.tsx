import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AccountView, OrderState, OrderView } from "@bullpen/contracts";
import { Orders } from "./AccountPanels.js";

const order = (id: string, state: OrderState, minutes: number, over: Partial<OrderView> = {}): OrderView => ({
  orderId: id, symbol: "AAPL", side: "buy", type: "market", state, quantity: "10.00000000", filledQty: state === "filled" ? "10.00000000" : "0.00000000", openQty: "0.00000000", cancelledQty: "0.00000000",
  avgPrice: state === "filled" ? "236.10000000" : null, capPrice: "999.00000000", reserved: "100.00000000", spent: "0.00000000", released: "50.00000000", releaseDone: true, needsAttention: null,
  createdAt: new Date(Date.UTC(2026, 9, 20, 10, minutes)).toISOString(), cancelRequestedAt: null, ...over,
});
const viewOf = (orders: OrderView[]) => ({ orders }) as unknown as AccountView;
const finishedOrders = (count: number) => Array.from({ length: count }, (_, i) => order(`f${i}`, "filled", i + 1, { symbol: `S${i}` }));

describe("Orders", () => {
  it("says there are none, in words", () => {
    render(<Orders view={viewOf([])} refresh={() => undefined} />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("shows open orders first, each with its detail and a Cancel", () => {
    render(<Orders view={viewOf([...finishedOrders(2), order("w", "working", 30, { symbol: "MSFT", openQty: "10.00000000" })])} refresh={() => undefined} />);
    const items = within(screen.getByRole("list", { name: "Your orders" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("MSFT");
    expect(within(items[0]!).getByRole("button", { name: /Cancel order/ })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(/set aside/);
    expect(items).toHaveLength(3);
  });

  it("shows at most five finished orders, newest first, one line each: symbol, side and quantity, a short summary and the state", () => {
    render(<Orders view={viewOf(finishedOrders(8))} refresh={() => undefined} />);
    const items = within(screen.getByRole("list", { name: "Your orders" })).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("S7"); // the newest
    expect(items[4]).toHaveTextContent("S3");
    expect(items[0]).toHaveTextContent("Buy 10");
    expect(items[0]).toHaveTextContent("$236.10");
    expect(items[0]).toHaveTextContent("Filled");
    expect(items[0]!.children).toHaveLength(4);
    expect(within(items[0]!).queryByRole("button")).toBeNull(); // nothing to cancel
    expect(items[0]).toHaveAttribute("title", expect.stringContaining("10 of 10 filled"));
  });

  it("'Show all (N)' opens the rest and 'Show fewer' folds them back", () => {
    render(<Orders view={viewOf(finishedOrders(8))} refresh={() => undefined} />);
    const toggle = screen.getByRole("button", { name: "Show all (8)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(within(screen.getByRole("list", { name: "Your orders" })).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(within(screen.getByRole("list", { name: "Your orders" })).getAllByRole("listitem")).toHaveLength(5);
  });

  it("has no toggle at five finished orders or fewer", () => {
    render(<Orders view={viewOf(finishedOrders(5))} refresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("summarises a cancelled, a part-filled and a refused order in a few words, never the whole sentence", () => {
    render(
      <Orders
        view={viewOf([
          order("c", "cancelled", 3, { symbol: "TSLA", quantity: "15.00000000" }),
          order("p", "cancelled", 2, { symbol: "NVDA", quantity: "30.00000000", filledQty: "10.00000000", avgPrice: "100" }),
          order("r", "rejected", 1, { symbol: "SPY", quantity: "5.00000000" }),
        ])}
        refresh={() => undefined}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Your orders" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("0 of 15");
    expect(items[1]).toHaveTextContent("10 of 30");
    expect(items[2]).toHaveTextContent("refused");
    expect(items[2]).not.toHaveTextContent("nothing was spent");
  });
});
