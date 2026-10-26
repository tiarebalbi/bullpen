"use client";

import { useState } from "react";

export type CancelAsk = "idle" | "sending" | "failed";

/** Asks the app to cancel one order. A request is not a cancel: the order moves to "cancel requested" and the venue confirms later. */
export function useCancelOrder(orderId: string, refresh: () => void): { asked: CancelAsk; cancel: () => Promise<void> } {
  const [asked, setAsked] = useState<CancelAsk>("idle");
  async function cancel(): Promise<void> {
    setAsked("sending");
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      setAsked(response.ok ? "idle" : "failed");
    } catch {
      setAsked("failed");
    }
    refresh();
  }
  return { asked, cancel };
}
