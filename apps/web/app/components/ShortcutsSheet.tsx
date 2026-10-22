"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SHORTCUTS } from "../lib/trading/shortcuts.js";

/** The shortcuts, in a small sheet. Esc closes it (the dialog's own behaviour) and focus returns to where it was. */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el || typeof el.showModal !== "function" || open === el.open) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);
  return (
    <dialog ref={dialog} className="bp-sheet bp-shortcuts" aria-label="Keyboard shortcuts" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <button type="button" className="bp-sheet__close" onClick={onClose}>Close</button>
      <h3 className="bp-ticket__title">Keyboard shortcuts</h3>
      <ul className="bp-shortcuts__list">
        {SHORTCUTS.map((s) => (
          <li key={s.key}>
            <kbd className="bp-kbd">{s.key}</kbd>
            <span><strong>{s.label}</strong> {s.detail}</span>
          </li>
        ))}
      </ul>
      <p className="bp-ticket__note">Shortcuts pause while you type in a field.</p>
    </dialog>
  );
}
