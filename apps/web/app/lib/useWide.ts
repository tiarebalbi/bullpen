"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 64rem)";
const subscribe = (notify: () => void): (() => void) => {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};

/** Whether the three-column frame is showing (the desktop layout). The server renders the desktop frame; a phone corrects it on hydration. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}
