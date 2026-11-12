import type { StockPriceSnapshot } from "@bullpen/contracts";

/** How often a function instance reads the shared price data, however many viewers it has (ADR-0029). */
export const HUB_INTERVAL_MS = 5_000;
/** The delay a client is told to wait before it reconnects, with `retry:`. The client adds its own jitter and backoff on top of failures. */
export const RETRY_HINT_MS = 3_000;

export type Sink = (chunk: string) => void;

export interface Frame {
  /** What `Last-Event-ID` carries: changes when any price, or any price's stale flag, changes. */
  id: string;
  snapshot: StockPriceSnapshot;
  /** When this instance read it. */
  at: number;
}

export interface HubOptions {
  /** One read of the shared price data: the only thing the hub does against the database. */
  read: () => Promise<StockPriceSnapshot>;
  intervalMs?: number;
  now?: () => number;
  /** Timer functions, so a test drives time itself. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
}

/** The id of a snapshot: the newest close, how many symbols, and how many are stale. Equal ids mean a client that holds one holds the other. */
export function frameId(snapshot: StockPriceSnapshot): string {
  let newest = 0;
  let stale = 0;
  for (const row of snapshot.rows) {
    newest = Math.max(newest, Date.parse(row.asOf));
    if (row.stale) stale += 1;
  }
  return `${newest}.${snapshot.rows.length}.${stale}`;
}

const sse = (fields: { event?: string; id?: string; data?: string; retry?: number; comment?: string }): string => {
  const lines: string[] = [];
  if (fields.comment !== undefined) lines.push(`: ${fields.comment}`);
  if (fields.retry !== undefined) lines.push(`retry: ${fields.retry}`);
  if (fields.event) lines.push(`event: ${fields.event}`);
  if (fields.id) lines.push(`id: ${fields.id}`);
  if (fields.data !== undefined) lines.push(`data: ${fields.data}`);
  return `${lines.join("\n")}\n\n`;
};

/**
 * One per function instance. It reads the shared price data once per interval and pushes the result to every connected client of this instance, so the
 * database sees one read per instance per interval whether there are ten viewers or ten thousand. Reads are coalesced: a client that connects while a
 * read is in flight, or just after one, shares it. There is no LISTEN/NOTIFY (the pooler runs in transaction mode); the clock is the trigger.
 *
 * The hub never calls a market-data provider. It reads the stored prices; the market-data service remains their only writer (ADR-0013).
 */
export class PriceHub {
  private readonly sinks = new Set<Sink>();
  private frame: Frame | null = null;
  private inFlight: Promise<Frame | null> | null = null;
  private timer: unknown = null;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  /** How many reads of the shared data this instance has made, and how many failed. The measurement reads these. */
  reads = 0;
  readFailures = 0;
  /** The most clients this instance has held at once. */
  peakClients = 0;

  constructor(private readonly options: HubOptions) {
    this.intervalMs = options.intervalMs ?? HUB_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  get clients(): number {
    return this.sinks.size;
  }

  get latest(): Frame | null {
    return this.frame;
  }

  /**
   * The current frame: the last read if it is younger than one interval, otherwise a new read that every concurrent caller shares. A failed read leaves
   * the last frame in place (the clients' own staleness rules say how old it is) and returns it.
   */
  refresh(maxAgeMs: number = this.intervalMs): Promise<Frame | null> {
    if (this.frame && this.now() - this.frame.at < maxAgeMs) return Promise.resolve(this.frame);
    this.inFlight ??= this.readOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async readOnce(): Promise<Frame | null> {
    this.reads += 1;
    try {
      const snapshot = await this.options.read();
      this.frame = { id: frameId(snapshot), snapshot, at: this.now() };
    } catch (error) {
      this.readFailures += 1;
      this.options.onError?.(error);
    }
    return this.frame;
  }

  /**
   * Connects a client. It is told how long to wait before reconnecting, and is sent the current prices unless `lastEventId` shows it already holds them.
   * Returns what disconnects it. The first client starts the instance's interval; the last one stops it, so an instance with no viewers reads nothing.
   */
  subscribe(sink: Sink, lastEventId?: string): () => void {
    this.sinks.add(sink);
    this.peakClients = Math.max(this.peakClients, this.sinks.size);
    sink(sse({ retry: RETRY_HINT_MS, comment: "bullpen price stream" }));
    if (this.timer === null) this.timer = this.setTimer(() => void this.pulse(), this.intervalMs);
    void this.refresh().then((frame) => {
      if (!this.sinks.has(sink)) return;
      if (!frame) sink(this.unavailable());
      else if (frame.id === lastEventId) sink(sse({ event: "tick", data: JSON.stringify({ at: frame.at, id: frame.id }) }));
      else sink(this.prices(frame));
    });
    return () => {
      this.sinks.delete(sink);
      if (this.sinks.size === 0 && this.timer !== null) {
        this.clearTimer(this.timer);
        this.timer = null;
      }
    };
  }

  /** Sent while the hub holds no prices at all (the first read failed): the stream is open but has nothing to say, and the client should poll, whose route answers 503 in words. */
  private unavailable(): string {
    return sse({ event: "unavailable", data: JSON.stringify({ at: this.now() }) });
  }

  private prices(frame: Frame): string {
    return sse({ event: "prices", id: frame.id, data: JSON.stringify({ ...frame.snapshot, servedAt: frame.at }) });
  }

  /** One interval: read once, then push to everyone: the prices if they changed since the last push, otherwise a tick that says the stream is alive. */
  private async pulse(): Promise<void> {
    const before = this.frame?.id ?? null;
    // The interval's own read, unless a client that connected a moment ago already made one: half an interval is "a moment".
    const frame = await this.refresh(this.intervalMs / 2);
    const message = !frame ? this.unavailable() : frame.id !== before ? this.prices(frame) : sse({ event: "tick", data: JSON.stringify({ at: this.now(), id: frame.id }) });
    for (const sink of [...this.sinks]) {
      try {
        sink(message);
      } catch {
        this.sinks.delete(sink); // a closed connection throws on write: drop it
      }
    }
  }
}

export { sse as formatEvent };
