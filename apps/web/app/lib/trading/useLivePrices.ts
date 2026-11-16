"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StockPriceSnapshot } from "@bullpen/contracts";
import type { Polled } from "../usePolled.js";
import { POLL_URL, PriceLink, type LinkDeps, type LinkState } from "./priceLink.js";

const browserDeps = (): LinkDeps => ({
  openStream: typeof EventSource === "undefined" ? null : (url) => new EventSource(url),
  fetchSnapshot: async () => {
    try {
      const response = await fetch(POLL_URL);
      return response.ok ? { snapshot: (await response.json()) as StockPriceSnapshot, streamPaused: response.headers.get("x-bullpen-stream") === "off" } : { httpStatus: response.status };
    } catch {
      return { httpStatus: null };
    }
  },
  now: () => Date.now(),
  random: () => Math.random(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

/** What a screen draws before the first frame: nothing, and reconnecting. */
const NONE: LinkState = { snapshot: null, status: "reconnecting", via: "none", lastFrameAt: null, failed: null, attempt: 0, nextRetryAt: null, streamPaused: false };

/**
 * The stock prices, live. They arrive by the event stream, with polling as the fallback (priceLink.ts). The first value is `Polled`-shaped, so the existing watchlist
 * and ticket read it unchanged; the second says whether the screen is Live, Delayed, Reconnecting, Stale or Offline; the third is "Retry now".
 */
export function useLivePrices(deps?: LinkDeps): { stocks: Polled<StockPriceSnapshot>; link: LinkState; retryNow: () => void } {
  const [link, setLink] = useState<LinkState>(NONE);
  const live = useRef<PriceLink | null>(null);
  useEffect(() => {
    const next = new PriceLink(deps ?? browserDeps(), setLink);
    live.current = next;
    next.start();
    return () => {
      next.stop();
      live.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the dependencies are the browser's, made once
  }, []);
  const stocks: Polled<StockPriceSnapshot> = link.snapshot ? { status: "ok", data: link.snapshot } : link.failed ? { status: "error", httpStatus: link.failed.httpStatus, message: "Stock prices unavailable." } : { status: "loading" };
  const retryNow = useCallback(() => live.current?.retryNow(), []);
  return { stocks, link, retryNow };
}
