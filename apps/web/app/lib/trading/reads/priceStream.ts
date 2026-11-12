import { formatEvent, type PriceHub } from "./priceHub.js";

/** Hobby functions are cut at 300 s. A stream ends on its own between 240 s and 270 s, so the cut never lands on a client mid-message (ADR-0029). */
export const STREAM_BASE_MS = 240_000;
export const STREAM_JITTER_MS = 30_000;
export const HOBBY_MAX_DURATION_MS = 300_000;

export interface StreamOptions {
  lastEventId?: string;
  /** The request's signal: the client going away closes the stream and frees its place. */
  signal?: AbortSignal;
  random?: () => number;
}

/** How long one connection lives: the base plus a jitter, so connections opened together do not all end, and reconnect, together. */
export const lifetimeMs = (random: () => number = Math.random): number => STREAM_BASE_MS + Math.floor(random() * STREAM_JITTER_MS);

/**
 * One client's server-sent event stream: the hub's messages, then a `bye` event and a clean close when its lifetime is up. The client reconnects (with its
 * backoff and jitter) and sends the id of the last frame it holds, so a reconnect costs it one frame at most and costs the database nothing extra.
 */
export function openPriceStream(hub: PriceHub, options: StreamOptions = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let finish: () => void = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => undefined;
      const held: { timer?: ReturnType<typeof setTimeout> } = {};
      finish = () => {
        if (closed) return;
        closed = true;
        clearTimeout(held.timer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the client going away
        }
      };
      const write = (chunk: string): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };
      unsubscribe = hub.subscribe(write, options.lastEventId);
      held.timer = setTimeout(() => {
        write(formatEvent({ event: "bye", data: JSON.stringify({ reconnect: true }) }));
        finish();
      }, lifetimeMs(options.random));
      options.signal?.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      finish();
    },
  });
}
