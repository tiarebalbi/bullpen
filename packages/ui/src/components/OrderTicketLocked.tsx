"use client";

import type { ReactNode } from "react";

/**
 * The order ticket as the rail draws it, with nothing you can press: Buy and Sell, Market and Limit, a quantity, the cost and the
 * buying power, and the one button. It is here so the screen is the screen the design has, and it says why it is off: there is no
 * sign-in yet. Every control is disabled, not hidden, and no number is shown, because there is no account to take one from.
 */
export interface OrderTicketLockedProps {
  /** Why it is off, in words: "Trading opens with sign-in in Part 4". */
  message: string;
}

export function OrderTicketLocked({ message }: OrderTicketLockedProps): ReactNode {
  return (
    <form className="bp-ticket" aria-label="Order ticket, not available" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled className="bp-ticket__fields">
        <div className="bp-ticket__tabs" role="group" aria-label="Side">
          <button type="button">Buy</button>
          <button type="button">Sell</button>
        </div>
        <div className="bp-ticket__tabs bp-ticket__tabs--small" role="group" aria-label="Order type">
          <button type="button">Market</button>
          <button type="button">Limit</button>
        </div>
        <label className="bp-ticket__field">
          <span>Quantity</span>
          <input inputMode="decimal" placeholder="—" aria-label="Quantity" />
        </label>
        <dl className="bp-ticket__sums">
          <div>
            <dt>Estimated cost</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>Buying power</dt>
            <dd>—</dd>
          </div>
        </dl>
        <button type="submit" className="bp-ticket__cta">
          Buy
        </button>
      </fieldset>
      <p className="bp-ticket__why" role="status">
        {message}
      </p>
    </form>
  );
}

/** The same switch for a phone: Sell and Buy pinned to the bottom of the screen, off, with the reason beside them. */
export function TradeBarLocked({ message }: OrderTicketLockedProps): ReactNode {
  return (
    <div className="bp-tradebar">
      <p>{message}</p>
      <div>
        <button type="button" disabled>
          Sell
        </button>
        <button type="button" disabled>
          Buy
        </button>
      </div>
    </div>
  );
}
