"use client";

import type { ReactNode } from "react";
import { EmptyState, Panel } from "@bullpen/ui";
import type { AccountView } from "@bullpen/contracts";
import { canCancel, isOpenState, orderDetail, quantityLabel, stateLook } from "../lib/trading/orderView.js";
import { activeOrder, clockLabel, timelineSteps, type StepStatus } from "../lib/trading/terminalView.js";
import { useCancelOrder } from "../lib/trading/useCancelOrder.js";

const GLYPH: Record<StepStatus, string> = { done: "✓", active: "◐", pending: "○", stopped: "⧖" };
const STATUS_WORD: Record<StepStatus, string> = { done: "done", active: "in progress", pending: "not yet", stopped: "stopped" };

/**
 * The player's latest order as a step line: reserve, sent, fills, settled. It is read from the order's own events, so a step is lit only
 * when it happened. Finished orders stay here as the last one, so a fill that landed at once is still seen. Esc asks to cancel (a confirm
 * step, kept by the page); the button asks at once.
 */
export function ActiveOrderPanel({ view, refresh, confirming, onConfirming }: { view: AccountView; refresh: () => void; confirming: boolean; onConfirming: (open: boolean) => void }): ReactNode {
  const active = activeOrder(view);
  if (!active) {
    return (
      <Panel title="Active order" label="Active order">
        <EmptyState title="No active order" description="Your next order runs here step by step, from reserving funds to settling." />
      </Panel>
    );
  }
  return <Active order={active.order} events={active.events} refresh={refresh} confirming={confirming} onConfirming={onConfirming} />;
}

function Active({ order, events, refresh, confirming, onConfirming }: NonNullable<ReturnType<typeof activeOrder>> & { refresh: () => void; confirming: boolean; onConfirming: (open: boolean) => void }): ReactNode {
  const { asked, cancel } = useCancelOrder(order.orderId, refresh);
  const look = stateLook(order.state);
  const steps = timelineSteps(order, events);
  const cancellable = canCancel(order.state);
  return (
    <Panel title={isOpenState(order.state) ? "Active order" : "Last order"} label="Active order" aside={<span className="bp-state" data-tone={look.tone} data-state={order.state}><span aria-hidden="true">{look.glyph}</span> {look.label}</span>}>
      <p className="bp-active__what">Buy {quantityLabel(order.quantity)} {order.symbol}</p>
      <ol className="bp-steps" aria-label="Order steps">
        {steps.map((step) => (
          <li key={step.key} className="bp-step" data-status={step.status}>
            <span className="bp-step__glyph" aria-hidden="true">{GLYPH[step.status]}</span>
            <span className="bp-step__body">
              <span className="bp-step__label">
                {step.label}
                <span className="bp-visually-hidden"> ({STATUS_WORD[step.status]})</span>
              </span>
              <span className="bp-step__sub">{step.sub}</span>
            </span>
            {step.at ? <time className="bp-step__time" dateTime={step.at}>{clockLabel(step.at)}</time> : null}
          </li>
        ))}
      </ol>
      <p className="bp-order__detail">{orderDetail(order)}</p>
      {order.needsAttention ? <p className="bp-order__detail">This one needs a look on my side; your money is held, not lost.</p> : null}
      {cancellable && !confirming ? (
        <button type="button" className="bp-order__cancel" onClick={() => void cancel()} disabled={asked === "sending"}>
          {asked === "sending" ? "Asking…" : "Cancel order"} <kbd className="bp-kbd">Esc</kbd>
        </button>
      ) : null}
      {cancellable && confirming ? (
        <div className="bp-confirm" role="alertdialog" aria-label="Confirm cancel" aria-describedby="bp-confirm-text">
          <p id="bp-confirm-text">Cancel this order? What has already filled stays yours; the rest of the reserve comes back.</p>
          <div className="bp-confirm__buttons">
            <button type="button" className="bp-order__cancel" onClick={() => { onConfirming(false); void cancel(); }}>Yes, cancel it</button>
            <button type="button" className="bp-order__cancel" onClick={() => onConfirming(false)} autoFocus>Keep it</button>
          </div>
        </div>
      ) : null}
      {asked === "failed" ? <p className="bp-order__detail" role="alert">I could not ask for that cancel. Try again in a moment.</p> : null}
    </Panel>
  );
}
