"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import type { AccountView, ApiError } from "@bullpen/contracts";
import { BTC_SYMBOL } from "./Watchlist.js";
import { buyLabel, estimate, formatMoney, newAttemptKey, parseQuantity, stepQuantity } from "../lib/trading/orderView.js";
import { FOCUS_TICKET_EVENT } from "../lib/trading/shortcuts.js";
import type { AccountState } from "../lib/trading/useAccount.js";

export interface OrderTicketProps {
  /** The symbol selected in the watchlist. */
  symbol: string;
  /** Its last stored price as a decimal string, or null when there is none (Bitcoin is a price only; a stock may not have one yet). */
  price: string | null;
  account: AccountState;
  /** Starts the GitHub sign-in (a server action). */
  signIn: () => Promise<void>;
  /** An account a request already returned, so the screen shows the order at once. */
  onAccount: (account: AccountView) => void;
  refresh: () => void;
}

/**
 * The order ticket: a market buy, and nothing else, because the lifecycle only has market buys. What it shows depends on what is true:
 * signed out it is an invitation to sign in, not a disabled form; where sign-in does not exist (a preview) it says so; signed in it is the form.
 */
export function OrderTicket(props: OrderTicketProps): ReactNode {
  const { account } = props;
  if (account.status === "loading") return <p className="bp-ticket__why" role="status">Reading your account…</p>;
  if (account.status === "off") {
    return (
      <div className="bp-ticket">
        <h3 className="bp-ticket__title">Order ticket</h3>
        <p className="bp-ticket__why" role="status">{account.message}</p>
      </div>
    );
  }
  if (account.status === "signed-out") {
    return (
      <form className="bp-ticket" action={props.signIn} aria-label="Sign in to trade">
        <h3 className="bp-ticket__title">Sign in to trade</h3>
        <p className="bp-ticket__why">An account makes your orders yours. Sign in with GitHub; the app shows you as a number, never your username.</p>
        <button type="submit" className="bp-ticket__cta" data-ready="">Sign in with GitHub</button>
      </form>
    );
  }
  if (account.status === "error") {
    return (
      <div className="bp-ticket">
        <p className="bp-ticket__why" role="alert">{account.message}</p>
        <button type="button" className="bp-ticket__cta" data-ready="" onClick={props.refresh}>Try again</button>
      </div>
    );
  }
  return <TicketForm {...props} view={account.account} />;
}

function TicketForm({ symbol, price, view, onAccount }: OrderTicketProps & { view: AccountView }): ReactNode {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // One key per attempt: a double click or a lost response retries the same order, and an edited quantity is a new attempt.
  const key = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  // `B` asks every ticket on the page to take focus; the one that is on screen does (a hidden one cannot).
  useEffect(() => {
    const focus = (): void => input.current?.focus();
    window.addEventListener(FOCUS_TICKET_EVENT, focus);
    return () => window.removeEventListener(FOCUS_TICKET_EVENT, focus);
  }, []);

  const orderable = symbol !== BTC_SYMBOL && price !== null;
  const parsed = parseQuantity(text);
  const sums = parsed.ok && price !== null ? estimate(parsed.quantity, price) : null;
  const short = sums !== null && sums.reserve > Number(view.buyingPower);

  const edit = (next: string): void => {
    setText(next);
    key.current = null; // an edited quantity is a new attempt
    setMessage(null);
  };
  const step = (direction: 1 | -1): void => edit(stepQuantity(text, direction));

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!orderable || !parsed.ok || short || busy) return;
    key.current ??= newAttemptKey();
    setBusy(true);
    setMessage(null);
    const outcome = await sendOrder(symbol, parsed.quantity, key.current);
    if (outcome.kind === "placed") {
      onAccount(outcome.account);
      setText("");
      key.current = null;
    } else if (outcome.kind === "refused") {
      key.current = null; // refused: not the same attempt on a retry
    }
    setMessage(outcome.kind === "placed" ? { tone: "ok", text: "Order accepted. It appears under Orders and moves as the venue answers." } : { tone: "error", text: outcome.message });
    setBusy(false);
  }

  const why = symbol === BTC_SYMBOL ? "Bitcoin is a price only here. Orders are for the stocks in the watchlist." : price === null ? `There is no price for ${symbol} yet, so it cannot be ordered.` : null;

  return (
    <form className="bp-ticket" onSubmit={(e) => void submit(e)} aria-label="Order ticket" noValidate>
      <h3 className="bp-ticket__title">Market buy · {symbol}</h3>
      <fieldset disabled={!orderable} className="bp-ticket__fields">
        <QuantityField id={id} inputRef={input} value={{ text, invalid: text !== "" && !parsed.ok }} onStep={step} onText={edit} />
        <TicketSums sums={sums} buyingPower={view.buyingPower} />
        <p id={`${id}-help`} className="bp-ticket__note">
          {text !== "" && !parsed.ok ? parsed.why : short ? "That is more than your buying power, with the 5% reserve." : "A market buy fills at the latest stored price. 5% above it is held until it fills, and what is unused comes back."}
        </p>
        <button type="submit" className="bp-ticket__cta" data-ready={orderable && parsed.ok && !short ? "" : undefined} aria-disabled={!orderable || !parsed.ok || short || busy ? true : undefined}>
          {busy ? "Placing…" : buyLabel(symbol, parsed.ok ? parsed.quantity : null, sums ? sums.cost : null)}
        </button>
      </fieldset>
      {why ? <p className="bp-ticket__why" role="status">{why}</p> : null}
      {message ? (
        <p className="bp-ticket__why" role={message.tone === "error" ? "alert" : "status"} data-tone={message.tone}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

/** The phone's bar: what the ticket would say in one line, and one button that opens the ticket as a sheet. */
export function TradeBar(props: OrderTicketProps): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const { account } = props;
  const line =
    account.status === "ok" ? `Buying power ${formatMoney(account.account.buyingPower)}` : account.status === "signed-out" ? "Sign in to place an order" : account.status === "off" ? "Sign-in is off on previews" : account.status === "loading" ? "Reading your account…" : "Your account is unavailable";
  const open = (): void => {
    const el = dialog.current;
    if (el && typeof el.showModal === "function") el.showModal();
  };
  // `B` on a phone opens the ticket's sheet and lands on its quantity; on the desktop frame the rail's own ticket takes the focus.
  useEffect(() => {
    const onFocusTicket = (): void => {
      const el = dialog.current;
      if (!el || window.matchMedia("(min-width: 64rem)").matches || account.status !== "ok") return;
      open();
      requestAnimationFrame(() => el.querySelector("input")?.focus());
    };
    window.addEventListener(FOCUS_TICKET_EVENT, onFocusTicket);
    return () => window.removeEventListener(FOCUS_TICKET_EVENT, onFocusTicket);
  });
  return (
    <div className="bp-tradebar">
      <p>{line}</p>
      <button type="button" className="bp-tradebar__open" onClick={open} disabled={account.status === "loading"}>
        {account.status === "off" ? "Why" : account.status === "signed-out" ? "Sign in" : "Trade"}
      </button>
      <dialog ref={dialog} className="bp-sheet" aria-label="Order ticket" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <button type="button" className="bp-sheet__close" onClick={() => dialog.current?.close()}>Close</button>
        <OrderTicket {...props} onAccount={(a) => { props.onAccount(a); dialog.current?.close(); }} />
      </dialog>
    </div>
  );
}

type Outcome = { kind: "placed"; account: AccountView } | { kind: "refused" | "failed"; message: string };

/** One POST of a market buy. A refusal (400, 422) is a different attempt on a retry; a network failure is the same one, so it is retried with its key. */
async function sendOrder(symbol: string, quantity: string, clientOrderId: string): Promise<Outcome> {
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol, quantity, clientOrderId }) });
    const body = (await response.json().catch(() => ({}))) as { account?: AccountView } & Partial<ApiError>;
    if (response.ok && body.account) return { kind: "placed", account: body.account };
    const message = body.message ?? "I could not place that order. Nothing was reserved.";
    return { kind: response.status === 422 || response.status === 400 ? "refused" : "failed", message };
  } catch {
    return { kind: "failed", message: "I could not reach the app. If the order went through it will show under Orders; trying again will not place a second one." };
  }
}

interface QuantityFieldProps {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  /** What is typed, and whether it is not a quantity the ticket will send. */
  value: { text: string; invalid: boolean };
  onStep: (direction: 1 | -1) => void;
  onText: (text: string) => void;
}

/** The quantity: a field with a − and a + of 44 px each. */
function QuantityField({ id, inputRef, value, onStep, onText }: QuantityFieldProps): ReactNode {
  return (
    <div className="bp-ticket__field">
      <label htmlFor={`${id}-qty`}>Quantity</label>
      <div className="bp-stepper">
        <button type="button" className="bp-stepper__button" aria-label="Decrease quantity" onClick={() => onStep(-1)}>−</button>
        <input id={`${id}-qty`} ref={inputRef} inputMode="decimal" autoComplete="off" value={value.text} placeholder="0" aria-describedby={`${id}-help`} aria-invalid={value.invalid ? true : undefined} onChange={(e) => onText(e.target.value)} />
        <button type="button" className="bp-stepper__button" aria-label="Increase quantity" onClick={() => onStep(1)}>+</button>
      </div>
    </div>
  );
}

/** What the buy would cost and hold, and buying power before → after (after the reserve is held). */
function TicketSums({ sums, buyingPower }: { sums: { cost: number; reserve: number } | null; buyingPower: string }): ReactNode {
  return (
    <dl className="bp-ticket__sums">
      <div>
        <dt>Estimated cost</dt>
        <dd>{sums ? formatMoney(String(sums.cost)) : "—"}</dd>
      </div>
      <div>
        <dt>Held in reserve</dt>
        <dd>{sums ? formatMoney(String(sums.reserve)) : "—"}</dd>
      </div>
      <div>
        <dt>Buying power</dt>
        <dd>
          {formatMoney(buyingPower)}
          {sums ? <span data-testid="bp-after"> → {formatMoney(String(Number(buyingPower) - sums.reserve))}</span> : null}
        </dd>
      </div>
    </dl>
  );
}
