"use client";

import { useEffect, useState } from "react";
import { FOCUS_TICKET_EVENT, shortcutFor } from "./shortcuts.js";

/**
 * Wires B, Esc and ? to the page. `activeOrderId` is the order Esc may ask to cancel (null when none can be), and the confirm belongs to that one
 * order: it closes by itself when the order moves on.
 */
export function useTerminalShortcuts(activeOrderId: string | null): { confirming: boolean; setConfirming: (open: boolean) => void; help: boolean; setHelp: (open: boolean) => void } {
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const shortcut = shortcutFor(event);
      if (shortcut === "ticket") {
        event.preventDefault();
        window.dispatchEvent(new Event(FOCUS_TICKET_EVENT)); // the phone's bar opens the ticket's sheet first
      } else if (shortcut === "cancel" && activeOrderId) {
        setConfirmFor((current) => (current === activeOrderId ? null : activeOrderId));
      } else if (shortcut === "help") {
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeOrderId]);

  return { confirming: activeOrderId !== null && confirmFor === activeOrderId, setConfirming: (open) => setConfirmFor(open ? activeOrderId : null), help, setHelp };
}
