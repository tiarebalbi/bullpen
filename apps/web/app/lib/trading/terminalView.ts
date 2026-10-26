import type { AccountView, FillView, LeaderboardSnapshot, OrderEventView, OrderView, PositionView, StockPriceEntry } from "@bullpen/contracts";
import { canCancel, formatMoney, quantityLabel } from "./orderView.js";

/** A position as the table draws it. Every figure comes from the account view; a figure it cannot compute is null, never a guess. */
export interface PositionLine {
  symbol: string;
  quantity: string;
  avgCost: string | null;
  last: string | null;
  value: string | null;
  /** Value less what was paid, in dollars; null without a price or a cost. */
  pl: number | null;
  /** The same as a share of what was paid. */
  plPercent: number | null;
}

/** Profit and loss against the average cost: (last − avg cost) × quantity. Needs both a last price and a cost basis. */
export function positionLine(p: PositionView): PositionLine {
  const base = { symbol: p.symbol, quantity: p.quantity, avgCost: p.avgCost, last: p.price, value: p.value };
  if (p.price === null || p.avgCost === null) return { ...base, pl: null, plPercent: null };
  const quantity = Number(p.quantity);
  const pl = (Number(p.price) - Number(p.avgCost)) * quantity;
  const paid = Number(p.avgCost) * quantity;
  return { ...base, pl, plPercent: paid > 0 ? (pl / paid) * 100 : null };
}

/** "N held" for a watchlist row: the player's quantity of that symbol, or null when none (the row then says nothing about holdings). */
export function heldLabel(positions: PositionView[], symbol: string): string | null {
  const held = positions.find((p) => p.symbol === symbol);
  return held && Number(held.quantity) > 0 ? `${quantityLabel(held.quantity)} held` : null;
}

/**
 * "#n of N": where the signed-in player stands, or null until they are ranked. The leaderboard returns the top rows and the caller's own row,
 * found by its neutral label; a player with no row is not ranked yet, and the header shows nothing rather than a placeholder.
 */
export function rankLabel(snapshot: LeaderboardSnapshot | null, label: string | null): string | null {
  const mine = snapshot?.rows.find((row) => row.handle === label);
  return snapshot && mine && label && snapshot.total > 0 ? `#${mine.rank} of ${snapshot.total}` : null;
}

/** The move since the previous stored close, shown only when both closes are stored; otherwise null and nothing is drawn. */
export function changeVsPreviousClose(entry: Pick<StockPriceEntry, "price" | "previousClose">): { percent: number; up: boolean } | null {
  if (!entry.previousClose) return null;
  const previous = Number(entry.previousClose.price);
  if (!(previous > 0)) return null;
  const percent = ((Number(entry.price) - previous) / previous) * 100;
  return { percent, up: percent >= 0 };
}

export type StepStatus = "done" | "active" | "pending" | "stopped";
export interface TimelineStep {
  key: "reserve" | "sent" | "fills" | "end";
  label: string;
  sub: string;
  status: StepStatus;
  /** The ISO time the step happened, when the order's events say so. */
  at: string | null;
}

const firstAt = (events: OrderEventView[], kind: OrderEventView["kind"]): string | null => events.find((e) => e.kind === kind)?.at ?? null;

/**
 * The order's step line: reserve → sent → fills → settled (or released, for an order that ended without filling). Every step is read from the
 * order's own events and numbers. "Cancel requested" is its own state on the fills step, and the last step says "Cancelled" only once the venue
 * confirmed; a request is not a cancel.
 */
export function timelineSteps(order: OrderView, events: OrderEventView[]): TimelineStep[] {
  const reserved = firstAt(events, "accepted");
  const sent = firstAt(events, "working");
  return [
    { key: "reserve", label: "Reserve", sub: `${formatMoney(order.reserved)} set aside`, status: reserved ? "done" : "active", at: reserved },
    { key: "sent", label: "Sent", sub: "At the venue", status: sent ? "done" : reserved ? "active" : "pending", at: sent },
    fillsStep(order, events, sent !== null),
    endStep(order, events),
  ];
}

const isFinished = (order: OrderView): boolean => order.state === "filled" || order.state === "cancelled" || order.state === "rejected";

const STOPPED: ReadonlySet<OrderView["state"]> = new Set(["cancel_requested", "cancelled", "rejected"]);

function fillsSub(order: OrderView): string {
  const filledText = `${quantityLabel(order.filledQty)} of ${quantityLabel(order.quantity)} filled`;
  if (order.state === "cancel_requested") return `Cancel requested… ${filledText}, and it can still fill until it confirms`;
  return order.state === "rejected" ? "The venue refused it" : filledText;
}

function fillsStatus(order: OrderView, sent: boolean): StepStatus {
  if (order.state === "filled") return "done";
  if (STOPPED.has(order.state)) return "stopped";
  return sent ? "active" : "pending";
}

function fillsStep(order: OrderView, events: OrderEventView[], sent: boolean): TimelineStep {
  const lastFill = [...events].reverse().find((e) => e.kind === "fill");
  return { key: "fills", label: "Fills", sub: fillsSub(order), status: fillsStatus(order, sent), at: lastFill?.at ?? null };
}

const END_LABEL: Partial<Record<OrderView["state"], string>> = { cancelled: "Cancelled", rejected: "Released" };

function endSub(order: OrderView, finished: boolean): string {
  if (finished && order.releaseDone) return `${formatMoney(order.released)} back in buying power`;
  return finished ? "Releasing the unused reserve" : "After the last fill, the unused reserve comes back";
}

function endStatus(finished: boolean, done: boolean): StepStatus {
  if (done) return "done";
  return finished ? "active" : "pending";
}

function endStep(order: OrderView, events: OrderEventView[]): TimelineStep {
  const finished = isFinished(order);
  const done = finished && order.releaseDone;
  return { key: "end", label: END_LABEL[order.state] ?? "Settled", sub: endSub(order, finished), status: endStatus(finished, done), at: firstAt(events, "released") ?? firstAt(events, "cancelled") };
}

/** "14:35:00": the time of day a fill or a step happened, in the viewer's own time. */
export function clockLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

/** One recent fill as a line: time, side, quantity, symbol, price. */
export function fillLine(f: FillView): { time: string; side: string; quantity: string; symbol: string; price: string } {
  return { time: clockLabel(f.executedAt), side: "Buy", quantity: quantityLabel(f.quantity), symbol: f.symbol, price: formatMoney(f.price) };
}

/** The order the active panel draws: the player's latest, with the events that belong to it. Null before the first order. */
export function activeOrder(view: AccountView): { order: OrderView; events: OrderEventView[] } | null {
  const latest = view.latestOrder;
  if (!latest) return null;
  const order = view.orders.find((o) => o.orderId === latest.orderId);
  return order ? { order, events: latest.events } : null;
}

/** The id of the player's latest order while it can still be asked to cancel, else null: what Esc may act on. */
export function cancellableOrderId(view: AccountView | null): string | null {
  const active = view ? activeOrder(view) : null;
  return active && canCancel(active.order.state) ? active.order.orderId : null;
}
