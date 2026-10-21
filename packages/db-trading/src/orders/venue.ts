import type { Pool } from "pg";
import type { FillEvent } from "./lifecycle.js";

/** What the lifecycle needs from wherever fills come from. A real Alpaca paper adapter would implement this; Part 4 calls no one. */
export interface VenueOrder {
  orderId: string;
  symbol: string;
  quantity: string;
  capPrice: string;
}
/** The venue's "no": the order is rejected with this reason. */
export interface VenueRefusal {
  refused: string;
}
export type VenueEvent = { kind: "fill"; fill: FillEvent } | { kind: "cancel-ack"; orderId: string; effectiveAt: Date };
export interface Venue {
  /** Idempotent: placing a known order again changes nothing. A venue that will not take the order says why. */
  place(order: VenueOrder, now: Date): Promise<void | VenueRefusal>;
  /** Idempotent: the first call fixes the effective time, a repeat only asks for the confirmation again. */
  cancel(orderId: string, now: Date): Promise<void>;
  /** Events that have become deliverable by `now`. Delivery is at-least-once: a lost acknowledgement means the same event again. */
  poll(now: Date): Promise<VenueEvent[]>;
}

export interface Quote {
  price: string;
  asOf: Date;
  stale: boolean;
}
export interface PriceSource {
  latest(symbol: string, now: Date): Promise<Quote | null>;
}

/** The latest price of the price contract, which is all the simulator fills at (ADR-0017). */
export const dbPriceSource = (pool: Pool): PriceSource => ({
  async latest(symbol) {
    const { rows } = await pool.query<{ price: string; as_of: Date; stale: boolean }>("SELECT price::text, as_of, stale FROM market_data.prices_v1 WHERE symbol = $1", [symbol]);
    return rows[0] ? { price: rows[0].price, asOf: rows[0].as_of, stale: rows[0].stale } : null;
  },
});

/** A price older than this is not filled at: the order is held (ADR-0017). */
export const MAX_FILL_PRICE_AGE_MS = 5 * 60_000;

const SCALE = 8;
const toUnits = (decimal: string): bigint => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole) * 10n ** BigInt(SCALE) + BigInt(fraction.padEnd(SCALE, "0").slice(0, SCALE));
};
const fromUnits = (units: bigint): string => `${units / 10n ** BigInt(SCALE)}.${(units % 10n ** BigInt(SCALE)).toString().padStart(SCALE, "0")}`;

/** mulberry32: a small seeded generator, so a seed names a run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulatedVenueOptions {
  seed: number;
  prices: PriceSource;
  /** Chance that an eligible fill is partial. Alpaca documents about 10 % for paper trading. */
  partialRate?: number;
  maxPriceAgeMs?: number;
  /** Between one fill of an order and the next. */
  fillDelayMs?: number;
  /** From a cancel request to the venue's confirmation. */
  ackDelayMs?: number;
  /** Chance that a polled fill is delivered twice (the first acknowledgement was lost). */
  duplicateRate?: number;
}

interface Working {
  order: VenueOrder;
  remaining: bigint;
  seq: number;
  nextFillAt: number;
  effectiveAt: Date | null;
  ackAt: number | null;
  ackPending: boolean;
  emitted: FillEvent[];
  held: number;
}

/**
 * A deterministic fill simulator, based on Alpaca's documented paper-trading behaviour: fills at the latest price,
 * partial about one time in ten with a seeded random size. It holds an order whose price is stale or above its ceiling.
 * A cancel gets an effective time; no fill executes at or after it, and every fill before it was already emitted.
 */
export class SimulatedVenue implements Venue {
  private readonly rng: () => number;
  private readonly orders = new Map<string, Working>();
  private readonly partialRate: number;
  private readonly maxPriceAgeMs: number;
  private readonly fillDelayMs: number;
  private readonly ackDelayMs: number;
  private readonly duplicateRate: number;

  constructor(private readonly options: SimulatedVenueOptions) {
    this.rng = seeded(options.seed);
    this.partialRate = options.partialRate ?? 0.1;
    this.maxPriceAgeMs = options.maxPriceAgeMs ?? MAX_FILL_PRICE_AGE_MS;
    this.fillDelayMs = options.fillDelayMs ?? 0;
    this.ackDelayMs = options.ackDelayMs ?? 0;
    this.duplicateRate = options.duplicateRate ?? 0;
  }

  async place(order: VenueOrder, now: Date): Promise<void> {
    if (this.orders.has(order.orderId)) return;
    this.orders.set(order.orderId, { order, remaining: toUnits(order.quantity), seq: 0, nextFillAt: now.getTime(), effectiveAt: null, ackAt: null, ackPending: false, emitted: [], held: 0 });
  }

  async cancel(orderId: string, now: Date): Promise<void> {
    const working = this.orders.get(orderId);
    if (!working) return;
    if (!working.effectiveAt) {
      working.effectiveAt = now;
      working.ackAt = now.getTime() + this.ackDelayMs;
    }
    working.ackPending = true;
  }

  /** How many polls found the order unfillable (stale price, or above the ceiling). */
  heldPolls(orderId: string): number {
    return this.orders.get(orderId)?.held ?? 0;
  }

  /** Every fill emitted for an order so far: what a redelivery after a lost acknowledgement carries. */
  emittedFills(orderId: string): FillEvent[] {
    return [...(this.orders.get(orderId)?.emitted ?? [])];
  }

  async poll(now: Date): Promise<VenueEvent[]> {
    const events: VenueEvent[] = [];
    for (const working of this.orders.values()) {
      const t = now.getTime();
      if (working.effectiveAt === null && working.remaining > 0n && t >= working.nextFillAt) {
        const fill = await this.execute(working, now);
        if (fill) {
          events.push({ kind: "fill", fill });
          if (this.rng() < this.duplicateRate) events.push({ kind: "fill", fill });
        }
      }
      if (working.effectiveAt && working.ackPending && working.ackAt !== null && t >= working.ackAt) {
        working.ackPending = false;
        events.push({ kind: "cancel-ack", orderId: working.order.orderId, effectiveAt: working.effectiveAt });
      }
    }
    return events;
  }

  private async execute(working: Working, now: Date): Promise<FillEvent | null> {
    const quote = await this.options.prices.latest(working.order.symbol, now);
    const tooOld = !quote || quote.stale || now.getTime() - quote.asOf.getTime() > this.maxPriceAgeMs;
    if (tooOld || toUnits(quote.price) > toUnits(working.order.capPrice)) {
      working.held += 1;
      return null;
    }
    const partial = this.rng() < this.partialRate && working.remaining > 1n;
    const size = partial ? 1n + BigInt(Math.floor(this.rng() * Number(working.remaining - 1n) * 0.9)) : working.remaining;
    working.remaining -= size;
    working.nextFillAt = now.getTime() + this.fillDelayMs;
    const fill: FillEvent = { fillId: `${working.order.orderId}:${working.seq}`, orderId: working.order.orderId, quantity: fromUnits(size), price: quote.price, executedAt: now };
    working.seq += 1;
    working.emitted.push(fill);
    return fill;
  }
}

const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
};

export interface DerivedVenueOptions {
  seed: number;
  prices: PriceSource;
  partialRate?: number;
  maxPriceAgeMs?: number;
  /** From the cancel request to the venue's confirmation. The effective time is the request time. */
  ackDelayMs?: number;
  /** Orders looked at in one poll. */
  batch?: number;
  /** Look at one account's orders only: what a player's own status poll advances. */
  accountId?: string;
}

/**
 * The same simulator with no memory of its own, so it can run in a function that starts fresh on every tick. What it
 * knows about an order it reads from the order and its fills: the next fill's id is `<order>:<fills so far>`, its size comes from a
 * generator seeded by (seed, order, that number), and a cancel is effective at the time it was requested. A tick that dies
 * and runs again derives the same fill with the same id, which the lifecycle books once.
 */
export class DerivedVenue implements Venue {
  private readonly partialRate: number;
  private readonly maxPriceAgeMs: number;
  private readonly ackDelayMs: number;
  private readonly batch: number;

  constructor(
    private readonly pool: Pool,
    private readonly options: DerivedVenueOptions,
  ) {
    this.partialRate = options.partialRate ?? 0.1;
    this.maxPriceAgeMs = options.maxPriceAgeMs ?? MAX_FILL_PRICE_AGE_MS;
    this.ackDelayMs = options.ackDelayMs ?? 0;
    this.batch = options.batch ?? 100;
  }

  /** The venue refuses an order whose symbol has no price at the moment it receives it (the quote was withdrawn after the order was accepted). */
  async place(order: VenueOrder, now: Date): Promise<void | VenueRefusal> {
    return (await this.options.prices.latest(order.symbol, now)) ? undefined : { refused: "no-price" };
  }
  async cancel(): Promise<void> {}

  async poll(now: Date): Promise<VenueEvent[]> {
    const { rows } = await this.pool.query<{ order_id: string; symbol: string; status: string; open_qty: string; cap_price: string; cancel_requested_at: Date | null; fills: string }>(
      `SELECT o.order_id, o.symbol, o.status, o.open_qty::text, o.cap_price::text, o.cancel_requested_at,
              (SELECT count(*) FROM trading.fills f WHERE f.order_id = o.order_id) AS fills
         FROM trading.orders o WHERE o.status IN ('working', 'partially_filled', 'cancel_requested') AND ($2::uuid IS NULL OR o.account_id = $2::uuid) ORDER BY o.updated_at LIMIT $1`,
      [this.batch, this.options.accountId ?? null],
    );
    const events: VenueEvent[] = [];
    for (const order of rows) {
      if (order.status === "cancel_requested") {
        if (order.cancel_requested_at && now.getTime() >= order.cancel_requested_at.getTime() + this.ackDelayMs) {
          events.push({ kind: "cancel-ack", orderId: order.order_id, effectiveAt: order.cancel_requested_at });
        }
        continue;
      }
      const quote = await this.options.prices.latest(order.symbol, now);
      if (!quote || quote.stale || now.getTime() - quote.asOf.getTime() > this.maxPriceAgeMs || toUnits(quote.price) > toUnits(order.cap_price)) continue;
      const remaining = toUnits(order.open_qty);
      if (remaining <= 0n) continue;
      const rng = seeded(fnv1a(`${this.options.seed}:${order.order_id}:${order.fills}`));
      const partial = rng() < this.partialRate && remaining > 1n;
      const size = partial ? 1n + BigInt(Math.floor(rng() * Number(remaining - 1n) * 0.9)) : remaining;
      events.push({ kind: "fill", fill: { fillId: `${order.order_id}:${order.fills}`, orderId: order.order_id, quantity: fromUnits(size), price: quote.price, executedAt: now } });
    }
    return events;
  }
}
