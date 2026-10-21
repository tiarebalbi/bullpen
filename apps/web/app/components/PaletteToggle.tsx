"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const KEY = "bullpen-palette";
const listeners = new Set<() => void>();

/** The palette lives on <html data-cb>, the attribute the design tokens read; the toggle only reads and writes it. */
const isOn = (): boolean => document.documentElement.dataset.cb === "on";
function setPalette(on: boolean): void {
  if (on) document.documentElement.dataset.cb = "on";
  else delete document.documentElement.dataset.cb;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The colour-blind palette (the design tokens' `data-cb="on"`): blue and orange for gain and loss. A per-viewer convenience, remembered in this browser only. */
export function PaletteToggle(): ReactNode {
  const on = useSyncExternalStore(subscribe, isOn, () => false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "on") setPalette(true);
    } catch {
      // Storage can be blocked; the toggle still works for this visit.
    }
  }, []);

  return (
    <button
      type="button"
      className="bp-palette-toggle"
      aria-pressed={on}
      onClick={() => {
        setPalette(!on);
        try {
          window.localStorage.setItem(KEY, on ? "off" : "on");
        } catch {
          // Not remembered; fine.
        }
      }}
    >
      Colour-blind palette
    </button>
  );
}
