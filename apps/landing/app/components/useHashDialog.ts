import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = (): string => window.location.hash;
const getServerHash = (): string => "";

/** The URL's hash, kept in step with the browser's own same-page navigation. Empty on the server. */
export function useLocationHash(): string {
  return useSyncExternalStore(subscribeToHash, getHash, getServerHash);
}

/**
 * Puts `hash` in the URL without adding a history entry. `replaceState` changes
 * the URL but fires no `hashchange`, so everything that reads the hash (this
 * hook, the architecture page's tabs) would keep the one it read before: a
 * dialog closed by Escape would still think its hash was current, and the
 * link that opens it would change nothing the second time. So the change is
 * announced, the way the browser announces one it makes itself.
 */
export function replaceHash(hash: string): void {
  const oldURL = window.location.href;
  history.replaceState(null, "", window.location.pathname + window.location.search + hash);
  window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: window.location.href }));
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Chromium's own dialog focus trap only holds reliably with several
 * focusable descendants; with just one (the close button, on an ADR whose
 * body happens to have no links), Tab escapes to `document.body` instead
 * of wrapping -- confirmed by instrumenting a real browser, not assumed.
 * This keydown handler traps Tab/Shift+Tab explicitly, regardless of how
 * many focusable elements a dialog's body happens to render.
 */
export function trapTabKey(e: KeyboardEvent<HTMLDialogElement>): void {
  if (e.key !== "Tab") return;
  const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

export interface HashDialog {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Spread onto the `<dialog>`: closing, backdrop click and the Tab trap. */
  dialogProps: {
    ref: RefObject<HTMLDialogElement | null>;
    onClose: () => void;
    onClick: (event: React.MouseEvent<HTMLDialogElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDialogElement>) => void;
  };
}

/**
 * A `<dialog>` driven by the URL's hash, for a modal that is opened by a real
 * anchor (`href="#adr-0002"`, `href="#structure-adl"`): the browser's own
 * same-page navigation opens it, and the dialog gets an inert background, a
 * native focus trap and Escape-to-close for free (see ADR-0006/0007 for the
 * sibling "why a real platform primitive over hand-rolled" precedent).
 *
 * `open` is whether the current hash names this dialog. `closeHash` is where
 * closing leaves the hash: nothing on the home page, the tab's own hash on
 * the architecture page, where the hash is also the tab.
 */
export function useHashDialog(open: boolean, closeHash: string): HashDialog {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const closeToHash = (): void => {
    if (window.location.hash !== closeHash) replaceHash(closeHash);
    lastFocusedRef.current?.focus();
  };

  return {
    dialogRef,
    dialogProps: {
      ref: dialogRef,
      onClose: closeToHash,
      onClick: (event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      },
      onKeyDown: trapTabKey,
    },
  };
}
