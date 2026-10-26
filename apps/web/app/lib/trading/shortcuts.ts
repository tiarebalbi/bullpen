/** The event `B` sends: every order ticket on the page hears it, and the one that is on screen takes focus. */
export const FOCUS_TICKET_EVENT = "bullpen:focus-ticket";

export type Shortcut = "ticket" | "cancel" | "help";
const KEYS: Record<string, Shortcut> = { b: "ticket", escape: "cancel", "?": "help" };

/** Whether a key press happened while the viewer was typing: in a field, or in anything editable. A shortcut never fires then, Esc included. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** What a key press asks for: `B` the ticket, `Esc` the active order's cancel, `?` the shortcuts. Nothing while typing, and nothing with Ctrl, Cmd or Alt held. */
export function shortcutFor(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "repeat">): Shortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (isTyping(event.target)) return null;
  return KEYS[event.key.toLowerCase()] ?? null;
}

export const SHORTCUTS: ReadonlyArray<{ key: string; label: string; detail: string }> = [
  { key: "B", label: "Buy", detail: "Go to the order ticket's quantity" },
  { key: "Esc", label: "Cancel order", detail: "Ask to cancel your active order, then confirm" },
  { key: "?", label: "Shortcuts", detail: "Open this list" },
];
