"use client";

import { useState, type ReactNode } from "react";
import { EmptyState, Panel } from "@bullpen/ui";
import type { AccountView, OrderView } from "@bullpen/contracts";
import { canCancel, formatMoney, orderDetail, quantityLabel, stateLook } from "../lib/trading/orderView.js";
import type { AccountState } from "../lib/trading/useAccount.js";

/** The player's portfolio and orders. Nothing here exists until there is an account: a visitor who is not signed in sees the ticket's invitation instead. */
export function AccountPanels({ account, refresh }: { account: AccountState; refresh: () => void }): ReactNode {
  if (account.status !== "ok") return null;
  return (
    <>
      <Portfolio view={account.account} />
      <Orders view={account.account} refresh={refresh} />
    </>
  );
}

export function Portfolio({ view }: { view: AccountView }): ReactNode {
  return (
    <Panel title="Your portfolio" aside={<span className="bp-account__who">{view.label}</span>}>
      <dl className="bp-account__stats">
        <Stat label="Equity" value={formatMoney(view.equity)} />
        <Stat label="Buying power" value={formatMoney(view.buyingPower)} />
        <Stat label="In open orders" value={formatMoney(view.reserved)} />
        <Stat label="Positions" value={formatMoney(view.positionsValue)} />
      </dl>
      {view.positions.length === 0 ? (
        <EmptyState title="No positions yet" description="A position appears here once a buy fills." />
      ) : (
        <table className="bp-account__positions">
          <caption className="bp-visually-hidden">Positions</caption>
          <thead>
            <tr><th scope="col">Symbol</th><th scope="col">Quantity</th><th scope="col">Price</th><th scope="col">Value</th></tr>
          </thead>
          <tbody>
            {view.positions.map((p) => (
              <tr key={p.symbol}>
                <th scope="row">{p.symbol}</th>
                <td>{quantityLabel(p.quantity)}</td>
                <td>{p.price ? formatMoney(p.price) : "No price"}</td>
                <td>{p.value ? formatMoney(p.value) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Orders({ view, refresh }: { view: AccountView; refresh: () => void }): ReactNode {
  return (
    <Panel title="Orders">
      {view.orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Pick a stock, enter a quantity and buy. The order shows up here and moves as the venue answers." />
      ) : (
        <ul className="bp-orders" aria-label="Your orders">
          {view.orders.map((o) => (
            <OrderRow key={o.orderId} order={o} refresh={refresh} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function OrderRow({ order, refresh }: { order: OrderView; refresh: () => void }): ReactNode {
  const look = stateLook(order.state);
  const [asked, setAsked] = useState<"idle" | "sending" | "failed">("idle");
  async function cancel(): Promise<void> {
    setAsked("sending");
    try {
      const response = await fetch(`/api/orders/${order.orderId}/cancel`, { method: "POST" });
      setAsked(response.ok ? "idle" : "failed");
    } catch {
      setAsked("failed");
    }
    refresh();
  }
  return (
    <li className="bp-order" data-state={order.state}>
      <div className="bp-order__head">
        <span className="bp-order__symbol">{order.symbol}</span>
        <span className="bp-order__qty">Buy {quantityLabel(order.quantity)}</span>
        <span className="bp-state" data-tone={look.tone} data-state={order.state}>
          <span aria-hidden="true">{look.glyph}</span> {look.label}
        </span>
      </div>
      <p className="bp-order__detail">{orderDetail(order)}</p>
      {order.needsAttention ? <p className="bp-order__detail">This one needs a look on my side; your money is held, not lost.</p> : null}
      {canCancel(order.state) ? (
        <button type="button" className="bp-order__cancel" onClick={() => void cancel()} disabled={asked === "sending"}>
          {asked === "sending" ? "Asking…" : "Cancel order"}
        </button>
      ) : null}
      {asked === "failed" ? <p className="bp-order__detail" role="alert">I could not ask for that cancel. Try again in a moment.</p> : null}
    </li>
  );
}
