"use client";

import type { ReactNode } from "react";
import type { AdlLine } from "../../lib/adl.js";
import { AdlSource } from "./AdlSource.js";
import { ADL_FILE_HASH } from "./RuleCardGrid.js";
import { useHashDialog, useLocationHash } from "./useHashDialog.js";

/**
 * The whole of structure.adl, highlighted the way the cards are, in the same
 * hash-driven `<dialog>` the decisions use. Every ADL card's "View
 * structure.adl" link is a real anchor to `#structure-adl`, so the browser's
 * own navigation opens it, and Escape, the backdrop and the focus trap come
 * with the platform.
 */
export function AdlFileModal({ source, lines, closeHash = "" }: { source: string; lines: AdlLine[]; closeHash?: string }): ReactNode {
  const open = useLocationHash() === ADL_FILE_HASH;
  const { dialogRef, dialogProps } = useHashDialog(open, closeHash);

  return (
    <dialog {...dialogProps} className="bp-decision-modal bp-adl-modal" aria-labelledby="bp-adl-modal-title">
      {open ? (
        <div className="bp-decision-modal__inner">
          <div className="bp-decision-modal__head">
            <span className="bp-decision-modal__id">{source}</span>
            <span className="bp-decision-modal__meta">{lines.length} lines</span>
            <button type="button" className="bp-decision-modal__close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
              ✕
            </button>
          </div>
          <h3 id="bp-adl-modal-title" className="bp-decision-modal__title">
            structure.adl
          </h3>
          <div className="bp-adl-modal__file">
            <AdlSource lines={lines} label="structure.adl, in full" />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
