import type { StockPriceSnapshot } from "@bullpen/contracts";

/**
 * What the screen says about its prices (ADR-0029), in the design system's indicator vocabulary: Live on the stream; Delayed on the polling fallback; Reconnecting
 * while the stream is being re-opened; Stale when the prices are past their close or the feed has gone quiet; Offline when nothing has answered and there are no prices.
 */
export type LinkStatus = "live" | "delayed" | "reconnecting" | "stale" | "offline";

export interface LinkState {
  snapshot: StockPriceSnapshot | null;
  status: LinkStatus;
  /** How the snapshot arrived: the event stream, or the polling fallback. */
  via: "stream" | "polling" | "none";
  /** When the last frame, tick or poll answer arrived (ms since the epoch), or null before the first: the indicator says how fresh the feed is from it. */
  lastFrameAt: number | null;
  /** Set when the polling fallback's last attempt failed and there is nothing to show: the HTTP status it got (503 for a database that is down), or null for no answer at all. */
  failed: { httpStatus: number | null } | null;
  /** How many times in a row the stream has failed (reset when it speaks): the indicator says "attempt N of 3" while it is under the polling threshold. */
  attempt: number;
  /** When the next automatic try is due (ms since the epoch): the stream's reconnect or the next poll, whichever is first. Null when nothing is scheduled. */
  nextRetryAt: number | null;
  /** True when the last poll said the price-stream switch is off, so "polling" is a decision and not a failure. */
  streamPaused: boolean;
}

/** One poll of the fallback route: the prices, or why there are none. */
export type PollResult = { snapshot: StockPriceSnapshot; streamPaused?: boolean } | { httpStatus: number | null };

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
  fetchSnapshot(): Promise<PollResult>;
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
  private state: LinkState = { snapshot: null, status: "reconnecting", via: "none", lastFrameAt: null, failed: null, attempt: 0, nextRetryAt: null, streamPaused: false };
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
  private reconnectAt: number | null = null;
  private pollAt: number | null = null;
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
    this.reconnectAt = this.pollAt = null;
  }

  private publish(): void {
    const age = this.lastFrameAt === null ? Infinity : this.deps.now() - this.lastFrameAt;
    let status: LinkStatus;
    if (this.state.snapshot === null) status = this.state.failed ? "offline" : "reconnecting";
    else if (anyStale(this.state.snapshot)) status = "stale";
    else if (this.polling) status = age > POLL_MS * 3 ? "stale" : "delayed";
    else if (!this.connected) status = "reconnecting";
    else status = age > STALE_AFTER_MS ? "stale" : "live";
    const due = [this.reconnectAt, this.pollAt].filter((at): at is number => at !== null);
    this.state = {
      ...this.state,
      status,
      via: this.polling ? "polling" : this.state.snapshot ? "stream" : "none",
      lastFrameAt: this.lastFrameAt,
      attempt: this.failures,
      nextRetryAt: due.length > 0 ? Math.min(...due) : null,
    };
    this.onChange(this.state);
  }

  private take(snapshot: StockPriceSnapshot): void {
    this.state = { ...this.state, snapshot, failed: null };
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
      this.state = { ...this.state, streamPaused: false };
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
    // An "error" the browser raises itself, or an "unavailable" the server sends when it holds no prices: the same to the screen, which polls and retries.
    const failed = (): void => {
      source.close();
      this.connected = false;
      this.failures += 1;
      // With nothing on screen yet, do not make the player wait through the backoff: poll at once. With prices on screen, keep them and retry the stream first.
      if (this.failures >= POLL_AFTER_FAILURES || this.state.snapshot === null) this.startPolling();
      this.scheduleReconnect(this.failures >= POLL_AFTER_FAILURES ? RETRY_WHILE_POLLING_MS : backoffMs(this.failures, this.deps.random));
      this.publish();
    };
    source.addEventListener("error", failed);
    source.addEventListener("unavailable", failed);
  }

  private scheduleReconnect(ms: number): void {
    if (this.stopped) return;
    if (this.reconnectTimer !== null) this.deps.clearTimeout(this.reconnectTimer);
    this.reconnectAt = this.deps.now() + ms;
    this.reconnectTimer = this.deps.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAt = null;
      this.connect();
    }, ms);
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    const poll = (): void => {
      void this.deps.fetchSnapshot().then((result) => {
        if (this.stopped || !this.polling) return;
        if ("snapshot" in result) {
          this.take(result.snapshot);
          this.state = { ...this.state, streamPaused: result.streamPaused === true };
        } else if (this.state.snapshot === null) this.state = { ...this.state, failed: { httpStatus: result.httpStatus } };
        this.publish();
      });
      this.pollAt = this.deps.now() + POLL_MS;
      this.pollTimer = this.deps.setTimeout(poll, POLL_MS);
    };
    this.pollNow = poll;
    poll();
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer !== null) this.deps.clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.pollAt = null;
    this.pollNow = null;
  }

  private pollNow: (() => void) | null = null;

  /**
   * "Retry now": the player does not wait for the countdown. The stream is opened again at once and, if the screen is polling, the prices are asked for at once too.
   * The failure count is kept, so a feed that is still down keeps backing off after this try.
   */
  retryNow(): void {
    if (this.stopped) return;
    if (this.reconnectTimer !== null) this.deps.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAt = null;
    if (this.pollNow !== null) {
      if (this.pollTimer !== null) this.deps.clearTimeout(this.pollTimer);
      this.pollNow();
    }
    if (this.deps.openStream !== null) {
      this.source?.close();
      this.connect();
    }
    this.publish();
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
