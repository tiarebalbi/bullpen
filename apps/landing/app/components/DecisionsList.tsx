"use client";

import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { adrHashId } from "../../lib/adrHashId.js";
import { isSuperseded, statusTone } from "../../lib/decisionStatus.js";
import { Chip } from "./ui.js";
import { useHashDialog, useLocationHash } from "./useHashDialog.js";

/**
 * The row list is a real anchor per row (`href="#adr-0002"`), so the browser's
 * own same-page hash navigation is what opens a decision -- the same
 * mechanism the Architecture Explorer's side-panel ADR links already use to
 * point here. A `<dialog>` driven by that hash gets an inert background,
 * a native focus trap and Escape-to-close for free (see ADR-0006/0007 for
 * the sibling "why a real platform primitive over hand-rolled" precedent).
 */
export function DecisionsList({
  adrs,
  closeHash = "",
  rowFilter,
}: {
  adrs: Adr[];
  /** Where closing the modal leaves the URL's hash: nothing on the home page, "#decisions" on the architecture page, where the hash is also the tab. */
  closeHash?: string;
  /** Lists only the decisions this accepts. A decision it hides can still be opened by its link. */
  rowFilter?: (adr: Adr) => boolean;
}): ReactNode {
  const hash = useLocationHash();
  const openAdr = adrs.find((a) => hash === `#${adrHashId(a.id)}`) ?? null;
  const { dialogRef, dialogProps } = useHashDialog(openAdr !== null, closeHash);

  return (
    <>
      <div className="bp-decisions-list">
        {adrs.filter((adr) => rowFilter?.(adr) ?? true).map((adr) => (
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
        {...dialogProps}
        className="bp-decision-modal"
        aria-labelledby={openAdr ? `${adrHashId(openAdr.id)}-title` : undefined}
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
