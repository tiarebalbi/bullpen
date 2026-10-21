import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountView, OrderState, OrderView } from "@bullpen/contracts";
import type { AccountState } from "../lib/trading/useAccount.js";
import { AccountPanels } from "./AccountPanels.js";
import { OrderTicket } from "./OrderTicket.js";

const order = (state: OrderState, over: Partial<OrderView> = {}): OrderView => ({
  orderId: `o-${state}`, symbol: "AAPL", side: "buy", type: "market", state, quantity: "10.00000000", filledQty: "0.00000000", openQty: "10.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "105.00000000", reserved: "1050.00000000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null,
  createdAt: "2026-10-20T10:00:00.000Z", cancelRequestedAt: null, ...over,
});
const view = (orders: OrderView[] = [], over: Partial<AccountView> = {}): AccountView => ({
  label: "Player 4F2A", buyingPower: "5000.00000000", reserved: "0.00000000", cash: "5000.00000000", positionsValue: "0.00000000", equity: "5000.00000000", positions: [], orders, asOf: "2026-10-20T10:00:00.000Z", ...over,
});
const ok = (account: AccountView): AccountState => ({ status: "ok", account });
const props = (account: AccountState, over = {}) => ({ symbol: "AAPL", price: "100.00000000", account, signIn: vi.fn(async () => undefined), onAccount: vi.fn(), refresh: vi.fn(), ...over });

afterEach(() => vi.unstubAllGlobals());

describe("the order ticket", () => {
  it("signed out is an invitation to sign in, not a disabled form", () => {
    render(<OrderTicket {...props({ status: "signed-out" })} />);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
  });

  it("where sign-in is off (a preview) it says so and shows no form", () => {
    render(<OrderTicket {...props({ status: "off", message: "Sign-in is not available here, so orders cannot be placed." })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sign-in is not available here");
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
  });

  it("offers a market buy only: no sell and no limit controls", () => {
    render(<OrderTicket {...props(ok(view()))} />);
    expect(screen.queryByText(/sell|limit/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Market buy · AAPL" })).toBeInTheDocument();
  });

  it("shows the estimated cost, the 5% reserve and the buying power from the typed quantity", () => {
    render(<OrderTicket {...props(ok(view()))} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "10" } });
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("$1,050.00")).toBeInTheDocument();
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();
  });

  it("will not place an order the buying power cannot cover, and says why", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<OrderTicket {...props(ok(view()))} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
    expect(screen.getByText(/more than your buying power/)).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form", { name: "Order ticket" }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("Bitcoin is a price only: nothing can be typed or sent", () => {
    render(<OrderTicket {...props(ok(view()), { symbol: "BTC-USD", price: null })} />);
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Bitcoin is a price only");
  });

  it("sends one key per attempt: a failed network retry reuses it, an edited quantity gets a new one", async () => {
    const keys: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((JSON.parse(String(init.body)) as { clientOrderId: string }).clientOrderId);
      if (keys.length === 1) throw new Error("offline");
      return new Response(JSON.stringify({ orderId: "o1", duplicate: false, account: view([order("accepted")]) }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    const p = props(ok(view()));
    render(<OrderTicket {...p} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.submit(screen.getByRole("form", { name: "Order ticket" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/trying again will not place a second one/));
    fireEvent.submit(screen.getByRole("form", { name: "Order ticket" }));
    await waitFor(() => expect(p.onAccount).toHaveBeenCalled());
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1].body))).toMatchObject({ symbol: "AAPL", quantity: "2" });
  });
});

describe("the portfolio and the orders", () => {
  it("shows nothing for a visitor who is not signed in", () => {
    const { container } = render(<AccountPanels account={{ status: "signed-out" }} refresh={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("empty states are honest: no positions, no orders, no invented numbers", () => {
    render(<AccountPanels account={ok(view())} refresh={() => undefined} />);
    expect(screen.getByText("No positions yet")).toBeInTheDocument();
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
  });

  it("each of the seven states is drawn, and 'cancel requested' is not 'cancelled'", () => {
    const states: OrderState[] = ["accepted", "working", "partially_filled", "cancel_requested", "cancelled", "filled", "rejected"];
    render(<AccountPanels account={ok(view(states.map((s) => order(s))))} refresh={() => undefined} />);
    const labels = ["Accepted", "Working", "Partially filled", "Cancel requested…", "Cancelled", "Filled", "Rejected"];
    const badges = Array.from(document.querySelectorAll(".bp-state")).map((el) => el.textContent!.replace(/^\S+\s/, ""));
    expect(badges).toEqual(labels);
    expect(screen.getAllByRole("button", { name: "Cancel order" })).toHaveLength(3); // accepted, working, partially filled; not once asked or finished
    expect(screen.getByText(/Waiting for the fill engine to confirm/)).toBeInTheDocument();
  });

  it("asking to cancel posts to the order's cancel route and then refreshes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ outcome: "requested" }), { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    const refresh = vi.fn();
    render(<AccountPanels account={ok(view([order("working")]))} refresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith("/api/orders/o-working/cancel", { method: "POST" });
  });

  it("shows the player's positions at their prices, and 'No price' rather than a made-up value", () => {
    const account = view([], { positions: [{ symbol: "AAPL", quantity: "10.00000000", price: "100.00000000", value: "1000.00000000" }, { symbol: "MSFT", quantity: "1.00000000", price: null, value: null }] });
    render(<AccountPanels account={ok(account)} refresh={() => undefined} />);
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("No price")).toBeInTheDocument();
  });
});
