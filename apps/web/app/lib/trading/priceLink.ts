import type { StockPriceSnapshot } from "@bullpen/contracts";

/** What the screen says about its prices: Live, Reconnecting or Stale (ADR-0029). */
export type LinkStatus = "live" | "reconnecting" | "stale";

export interface LinkState {
  snapshot: StockPriceSnapshot | null;
  status: LinkStatus;
  /** How the snapshot arrived: the event stream, or the polling fallback. */
  via: "stream" | "polling" | "none";
  /** True when the polling fallback's last attempt failed and there is nothing to show. */
  failed: boolean;
}

export const STREAM_URL = "/api/prices/stream";
export const POLL_URL = "/api/stock-prices";
/** Reconnect delay after a failure: full jitter over BASE x 2^failures, capped. A planned close (the 300 s cut) reconnects after a short jitter instead. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const PLANNED_RECONNECT_JITTER_MS = 2_000;
/** After this many failures in a row the screen falls back to polling and tries the stream again only once a minute. */
export const POLL_AFTER_FAILURES = 3;
export const POLL_MS = 10_000;
export const RETRY_WHILE_POLLING_MS = 60_000;
/** Three missed intervals of the server's 5 s tick, and a little more: past this a stream that says nothing is not live. */
export const STALE_AFTER_MS = 20_000;
const WATCHDOG_MS = 5_000;

export interface StreamLike {
  addEventListener(type: string, listener: (event: { data?: string; lastEventId?: string }) => void): void;
  close(): void;
}

export interface LinkDeps {
  /** Null where the browser has no event streams: the screen then polls from the start. */
  openStream: ((url: string) => StreamLike) | null;
  fetchSnapshot(): Promise<StockPriceSnapshot | null>;
  now(): number;
  random(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** A price is stale when the price contract says so (ADR-0024: older than its kind allows). The client never decides that on its own clock. */
export const anyStale = (snapshot: StockPriceSnapshot | null): boolean => snapshot !== null && snapshot.rows.some((row) => row.stale);

/** The reconnect delay after the `failures`th failure in a row: full jitter, so a crowd that lost its connection together does not come back together. */
export const backoffMs = (failures: number, random: () => number): number => Math.floor(random() * Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** failures));

/**
 * The browser side of the price stream. It opens the event stream, resumes from the last event id on every reconnect, backs off with jitter after a failure,
 * reconnects calmly after the server's planned close, and falls back to polling `/api/stock-prices` when the stream keeps failing or is switched off. It owns no
 * React; the hook below wraps it, and a test drives it with a fake stream and a fake clock.
 */
export class PriceLink {
  private state: LinkState = { snapshot: null, status: "reconnecting", via: "none", failed: false };
  private source: StreamLike | null = null;
  private lastEventId: string | undefined;
  private lastFrameAt: number | null = null;
  private failures = 0;
  private connected = false;
  private polling = false;
  private stopped = true;
  private reconnectTimer: unknown = null;
  private pollTimer: unknown = null;
  private watchdog: unknown = null;
  /** How many connections were opened, for a test and the measurement. */
  opened = 0;

  constructor(private readonly deps: LinkDeps, private readonly onChange: (state: LinkState) => void) {}

  get current(): LinkState {
    return this.state;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (this.deps.openStream === null) this.startPolling();
    else this.connect();
    this.tickWatchdog();
  }

  stop(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;
    for (const handle of [this.reconnectTimer, this.pollTimer, this.watchdog]) if (handle !== null) this.deps.clearTimeout(handle);
    this.reconnectTimer = this.pollTimer = this.watchdog = null;
  }

  private publish(): void {
    const age = this.lastFrameAt === null ? Infinity : this.deps.now() - this.lastFrameAt;
    let status: LinkStatus;
    if (this.state.snapshot === null) status = "reconnecting";
    else if (anyStale(this.state.snapshot)) status = "stale";
    else if (this.polling) status = age > POLL_MS * 3 ? "stale" : "live";
    else if (!this.connected) status = "reconnecting";
    else status = age > STALE_AFTER_MS ? "stale" : "live";
    this.state = { ...this.state, status, via: this.polling ? "polling" : this.state.snapshot ? "stream" : "none" };
    this.onChange(this.state);
  }

  private take(snapshot: StockPriceSnapshot): void {
    this.state = { ...this.state, snapshot, failed: false };
    this.lastFrameAt = this.deps.now();
  }

  private connect(): void {
    if (this.stopped || this.deps.openStream === null) return;
    const url = this.lastEventId ? `${STREAM_URL}?lastEventId=${encodeURIComponent(this.lastEventId)}` : STREAM_URL;
    const source = this.deps.openStream(url);
    this.source = source;
    this.opened += 1;
    const heard = (): void => {
      this.connected = true;
      this.failures = 0;
      this.lastFrameAt = this.deps.now();
      if (this.polling) this.stopPolling();
    };
    source.addEventListener("prices", (event) => {
      try {
        const frame = JSON.parse(event.data ?? "") as StockPriceSnapshot & { servedAt?: number };
        this.take({ rows: frame.rows });
        if (event.lastEventId) this.lastEventId = event.lastEventId;
        heard();
      } catch {
        // a frame that is not JSON is ignored; the next one replaces it
      }
      this.publish();
    });
    source.addEventListener("tick", () => {
      heard();
      this.publish();
    });
    source.addEventListener("bye", () => {
      // The server's planned close, before Hobby's 300 s cut: not a failure, so no backoff growth, and a little jitter so a crowd does not return together.
      source.close();
      this.connected = false;
      this.scheduleReconnect(Math.floor(this.deps.random() * PLANNED_RECONNECT_JITTER_MS));
      this.publish();
    });
    source.addEventListener("error", () => {
      source.close();
      this.connected = false;
      this.failures += 1;
      // With nothing on screen yet, do not make the player wait through the backoff: poll at once. With prices on screen, keep them and retry the stream first.
      if (this.failures >= POLL_AFTER_FAILURES || this.state.snapshot === null) this.startPolling();
      this.scheduleReconnect(this.failures >= POLL_AFTER_FAILURES ? RETRY_WHILE_POLLING_MS : backoffMs(this.failures, this.deps.random));
      this.publish();
    });
  }

  private scheduleReconnect(ms: number): void {
    if (this.stopped) return;
    if (this.reconnectTimer !== null) this.deps.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = this.deps.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, ms);
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    const poll = (): void => {
      void this.deps.fetchSnapshot().then((snapshot) => {
        if (this.stopped || !this.polling) return;
        if (snapshot) this.take(snapshot);
        else if (this.state.snapshot === null) this.state = { ...this.state, failed: true };
        this.publish();
      });
      this.pollTimer = this.deps.setTimeout(poll, POLL_MS);
    };
    poll();
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer !== null) this.deps.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** Re-reads staleness with the clock, since a stream that goes quiet raises no event of its own. */
  private tickWatchdog(): void {
    this.watchdog = this.deps.setTimeout(() => {
      if (this.stopped) return;
      this.publish();
      this.tickWatchdog();
    }, WATCHDOG_MS);
  }
}
