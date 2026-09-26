import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { fmt, signed } from "./format.js";

const FLASH_MIN_INTERVAL_MS = 500; // 2 flashes/second cap, per the export's `now - lastFlashAt < 500` guard
const FLASH_DURATION_MS = 400; // --bp-dur-tick
const ANNOUNCE_MIN_INTERVAL_MS = 5_000; // "a polite summary at most every 5 s"

export type FlashDirection = "up" | "down" | null;

interface TickerArgs {
  symbol: string;
  price: number;
  changePercent: number;
  decimals: number;
  /** Only "live" prices flash/announce — loading, market-closed and reconnecting don't. */
  live: boolean;
  reduced: boolean;
}

interface TickerResult {
  flash: FlashDirection;
  announce: string;
}

/**
 * Everything PriceCell's "1a Pulse fill" tick treatment needs on top of
 * a plain render: the rate-capped flash and the throttled polite
 * screen-reader summary. Split out of PriceCell itself so each piece
 * stays small enough to read at a glance — see `onTick()` in
 * Bullpen Landing.dc.html for the behavior this reproduces.
 *
 * The flash's `setTimeout` is returned from the effect as its own
 * cleanup, rather than tracked in a ref: React runs that cleanup right
 * before the next tick's effect (and on unmount), so the previous
 * flash's timer is always cleared before a new one is scheduled,
 * with no separate "clear on unmount" effect needed.
 */
export function usePriceCellTicker({ symbol, price, changePercent, decimals, live, reduced }: TickerArgs): TickerResult {
  const [flash, setFlash] = useState<FlashDirection>(null);
  const [announce, setAnnounce] = useState("");

  const prevPriceRef = useRef(price);
  const lastFlashAtRef = useRef(0);
  const lastAnnounceAtRef = useRef(0);

  useEffect(() => {
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (!live || price === prev) return;

    const direction: FlashDirection = price > prev ? "up" : "down";
    const now = Date.now();

    const flashTimeout = triggerFlash({ now, reduced, direction, lastFlashAtRef, setFlash });
    announceTick({ now, direction, symbol, price, changePercent, decimals, lastAnnounceAtRef, setAnnounce });

    return () => {
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  }, [price, live, reduced, symbol, changePercent, decimals]);

  return { flash, announce };
}

function triggerFlash(args: {
  now: number;
  reduced: boolean;
  direction: FlashDirection;
  lastFlashAtRef: RefObject<number>;
  setFlash: (direction: FlashDirection) => void;
}): ReturnType<typeof setTimeout> | null {
  const { now, reduced, direction, lastFlashAtRef, setFlash } = args;
  if (reduced || now - lastFlashAtRef.current < FLASH_MIN_INTERVAL_MS) return null;

  lastFlashAtRef.current = now;
  setFlash(direction);
  return setTimeout(() => setFlash(null), FLASH_DURATION_MS);
}

function announceTick(args: {
  now: number;
  direction: FlashDirection;
  symbol: string;
  price: number;
  changePercent: number;
  decimals: number;
  lastAnnounceAtRef: RefObject<number>;
  setAnnounce: (text: string) => void;
}): void {
  const { now, direction, symbol, price, changePercent, decimals, lastAnnounceAtRef, setAnnounce } = args;
  if (now - lastAnnounceAtRef.current < ANNOUNCE_MIN_INTERVAL_MS) return;

  lastAnnounceAtRef.current = now;
  const arrow = direction === "up" ? "▲" : "▼";
  setAnnounce(`${symbol} ${fmt(price, decimals)} ${arrow} ${signed(changePercent, 2, "", "%")}`);
}
