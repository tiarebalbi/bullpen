"use client";

import { useEffect, useState } from "react";

/** What a polled route has answered: nothing yet, a failure (with the HTTP status when there was a response), or its JSON. */
export type Polled<T> = { status: "loading" } | { status: "error"; httpStatus: number | null; message: string } | { status: "ok"; data: T };

/** What one answer from the route says: its JSON, or the failure with its status and the route's own message. */
async function readAnswer<T>(url: string, fallbackMessage: string): Promise<Polled<T>> {
  try {
    const response = await fetch(url);
    if (response.ok) return { status: "ok", data: (await response.json()) as T };
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { status: "error", httpStatus: response.status, message: body.error ?? fallbackMessage };
  } catch {
    return { status: "error", httpStatus: null, message: fallbackMessage };
  }
}

/** Fetches `url` now and every `intervalMs`, and keeps the last answer. A failure replaces it, so the page never shows a stale success as live. */
export function usePolled<T>(url: string, intervalMs: number, fallbackMessage: string): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void readAnswer<T>(url, fallbackMessage).then((answer) => {
        if (!cancelled) setState(answer);
      });
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs, fallbackMessage]);

  return state;
}
