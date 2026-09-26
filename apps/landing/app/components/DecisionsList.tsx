"use client";

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { adrHashId } from "../../lib/adrHashId.js";
import { isSuperseded, statusTone } from "../../lib/decisionStatus.js";
import { Chip } from "./ui.js";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHash(): string {
  return window.location.hash;
}

function getServerHash(): string {
  return "";
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Chromium's own dialog focus trap only holds reliably with several
 * focusable descendants; with just one (the close button, on an ADR whose
 * body happens to have no links), Tab escapes to `document.body` instead
 * of wrapping -- confirmed by instrumenting a real browser, not assumed.
 * This keydown handler traps Tab/Shift+Tab explicitly, regardless of how
 * many focusable elements an ADR's body happens to render.
 */
function trapTabKey(e: KeyboardEvent<HTMLDialogElement>): void {
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

/**
 * The row list is a real anchor per row (`href="#adr-0002"`), so the browser's
 * own same-page hash navigation is what opens a decision -- the same
 * mechanism the Architecture Explorer's side-panel ADR links already use to
 * point here. A `<dialog>` driven by that hash gets an inert background,
 * a native focus trap and Escape-to-close for free (see ADR-0006/0007 for
 * the sibling "why a real platform primitive over hand-rolled" precedent).
 */
export function DecisionsList({ adrs }: { adrs: Adr[] }): ReactNode {
  const hash = useSyncExternalStore(subscribeToHash, getHash, getServerHash);
  const openAdr = adrs.find((a) => hash === `#${adrHashId(a.id)}`) ?? null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openAdr && !dialog.open) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!openAdr && dialog.open) {
      dialog.close();
    }
  }, [openAdr]);

  const closeToHome = (): void => {
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    lastFocusedRef.current?.focus();
  };

  return (
    <>
      <div className="bp-decisions-list">
        {adrs.map((adr) => (
          <a key={adr.id} href={`#${adrHashId(adr.id)}`} className="bp-decisions-row" data-superseded={isSuperseded(adr.status)}>
            <span className="bp-decisions-row__id">{adr.id}</span>
            <span className="bp-decisions-row__body">
              <span className="bp-decisions-row__summary">{adr.summary}</span>
              <span className="bp-decisions-row__meta">Part {adr.part}</span>
            </span>
            <Chip tone={statusTone(adr.status)}>{adr.status}</Chip>
            <span className="bp-decisions-row__hint" aria-hidden="true">
              View →
            </span>
          </a>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="bp-decision-modal"
        aria-labelledby={openAdr ? `${adrHashId(openAdr.id)}-title` : undefined}
        onClose={closeToHome}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onKeyDown={trapTabKey}
        onCancel={(e) => {
          // Let the native "cancel" -> "close" sequence run (closeToHome
          // handles the hash + focus cleanup); prevented only if we ever
          // need to block Escape, which we don't.
          void e;
        }}
      >
        {openAdr ? (
          <div className="bp-decision-modal__inner">
            <div className="bp-decision-modal__head">
              <span className="bp-decision-modal__id">{openAdr.id}</span>
              <Chip tone={statusTone(openAdr.status)}>{openAdr.status}</Chip>
              <span className="bp-decision-modal__meta">
                Part {openAdr.part} · {openAdr.date}
              </span>
              <button type="button" className="bp-decision-modal__close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
                ✕
              </button>
            </div>
            <h3 id={`${adrHashId(openAdr.id)}-title`} className="bp-decision-modal__title">
              {openAdr.title}
            </h3>

            <div className="bp-decision-modal__section">
              <div className="bp-decision-modal__section-label">Context</div>
              {/* Rendered from this ADR's own Markdown at build time (ADR-0007); html: false means no author-supplied HTML ever passes through unescaped. */}
              <div className="bp-decision-modal__prose" dangerouslySetInnerHTML={{ __html: openAdr.contextHtml }} />
            </div>
            <div className="bp-decision-modal__section">
              <div className="bp-decision-modal__section-label">Decision</div>
              <div className="bp-decision-modal__prose" dangerouslySetInnerHTML={{ __html: openAdr.decisionHtml }} />
            </div>
            <div className="bp-decision-modal__section">
              <div className="bp-decision-modal__section-label">Consequences</div>
              <div className="bp-decision-modal__prose" dangerouslySetInnerHTML={{ __html: openAdr.consequencesHtml }} />
            </div>
            <div className="bp-decision-modal__section">
              <div className="bp-decision-modal__section-label">Alternatives</div>
              <div className="bp-decision-modal__prose" dangerouslySetInnerHTML={{ __html: openAdr.alternativesHtml }} />
            </div>
            <div className="bp-decision-modal__section">
              <div className="bp-decision-modal__section-label">Links</div>
              <div className="bp-decision-modal__prose" dangerouslySetInnerHTML={{ __html: openAdr.linksHtml }} />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
