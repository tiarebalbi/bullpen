"use client";

import { useState, type ReactNode } from "react";
import { EmptyState, Panel } from "@bullpen/ui";
import type { AccountView, OrderView } from "@bullpen/contracts";
import { FINISHED_SHOWN, canCancel, orderDetail, orderSummary, quantityLabel, splitOrders, stateLook } from "../lib/trading/orderView.js";
import { useCancelOrder } from "../lib/trading/useCancelOrder.js";
import { Positions } from "./Positions.js";
import type { AccountState } from "../lib/trading/useAccount.js";

/** The player's positions and orders. Nothing here exists until there is an account: a visitor who is not signed in sees the ticket's invitation instead. */
export function AccountPanels({ account, refresh, withOrders = true }: { account: AccountState; refresh: () => void; withOrders?: boolean }): ReactNode {
  if (account.status !== "ok") return null;
  return (
    <>
      <Positions view={account.account} />
      {withOrders ? <Orders view={account.account} refresh={refresh} /> : null}
    </>
  );
}

/**
 * The orders that can still change come first, each with its detail and Cancel. Below them the most recent finished orders, five at most, as one line each:
 * symbol, side and quantity, a short summary and the state. "Show all (N)" opens the rest, so a long history never pushes the leaderboard out of reach.
 */
export function Orders({ view, refresh }: { view: AccountView; refresh: () => void }): ReactNode {
  const [all, setAll] = useState(false);
  const { open, finished } = splitOrders(view.orders);
  const shown = all ? finished : finished.slice(0, FINISHED_SHOWN);
  return (
    <Panel title="Orders">
      {view.orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Pick a stock, enter a quantity and buy. The order shows up here and moves as the venue answers." />
      ) : (
        <>
          <ul className="bp-orders" aria-label="Your orders">
            {open.map((o) => (
              <OrderRow key={o.orderId} order={o} refresh={refresh} />
            ))}
            {shown.map((o) => (
              <FinishedRow key={o.orderId} order={o} />
            ))}
          </ul>
          {finished.length > FINISHED_SHOWN ? (
            <button type="button" className="bp-orders__toggle" aria-expanded={all} onClick={() => setAll((on) => !on)}>
              {all ? "Show fewer" : `Show all (${finished.length})`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** A finished order on one line. The whole sentence about it is the tooltip. */
function FinishedRow({ order }: { order: OrderView }): ReactNode {
  const look = stateLook(order.state);
  return (
    <li className="bp-order bp-order--finished" data-state={order.state} title={orderDetail(order)}>
      <span className="bp-order__symbol">{order.symbol.replace("-USD", "")}</span>
      <span className="bp-order__qty">Buy {quantityLabel(order.quantity)}</span>
      <span className="bp-order__summary">{orderSummary(order)}</span>
      <span className="bp-state" data-tone={look.tone} data-state={order.state}>
        <span aria-hidden="true">{look.glyph}</span> {look.label}
      </span>
    </li>
  );
}

function OrderRow({ order, refresh }: { order: OrderView; refresh: () => void }): ReactNode {
  const look = stateLook(order.state);
  const { asked, cancel } = useCancelOrder(order.orderId, refresh);
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

interface BoardProps {
  wide: boolean;
  orders: ReactNode;
  orderPanels: ReactNode;
  leaderboard: ReactNode;
}

/**
 * The orders, the active order and fills, and the leaderboard under the positions. On the desktop frame the orders and the leaderboard sit side by side (the active order
 * and the fills are in the rail), so a long history never pushes the ranking out of the first screen; they stack when the column is narrow. On a phone the orders come in
 * their old place, before the active order and the fills, and the leaderboard last.
 */
export function OrdersAndLeaderboard({ wide, orders, orderPanels, leaderboard }: BoardProps): ReactNode {
  if (wide) {
    return (
      <div className="bp-board">
        {orders}
        {leaderboard}
      </div>
    );
  }
  return (
    <>
      {orders}
      {orderPanels}
      {leaderboard}
    </>
  );
}
