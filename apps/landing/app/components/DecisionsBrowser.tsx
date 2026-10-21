"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { buildDecisionsView, type DecisionsPart } from "../../lib/decisionsView.js";
import { DecisionsList } from "./DecisionsList.js";

/**
 * The Decisions card's tabs, rows and footer. The tabs and counts are built from the ADR files (`buildDecisionsView`), the rows are
 * the same anchors that open an ADR in its dialog, and "View all" expands the list in place.
 */
export function DecisionsBrowser({ adrs }: { adrs: Adr[] }): ReactNode {
  const [part, setPart] = useState<DecisionsPart>("all");
  const [expanded, setExpanded] = useState(false);
  const view = buildDecisionsView(adrs, part, expanded);
  const shown = new Set(view.rows.map((adr) => adr.id));
  const base = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (value: DecisionsPart): void => {
    setPart(value);
    setExpanded(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = view.tabs.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    select(view.tabs[next]!.value);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Filter decisions by part" className="bp-decision-tabs">
        {view.tabs.map((tab, index) => (
          <button
            key={String(tab.value)}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${String(tab.value)}`}
            aria-selected={tab.selected}
            aria-controls={`${base}-panel`}
            tabIndex={tab.selected ? 0 : -1}
            className="bp-decision-tab"
            onClick={() => select(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label} <span className="bp-decision-tab__count">{tab.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${String(view.part)}`} className="bp-decision-panel">
        <DecisionsList adrs={adrs} compact rowFilter={(adr) => shown.has(adr.id)} />
      </div>
      <div className="bp-decision-foot">
        <span className="bp-decision-foot__caption">{view.caption}</span>
        {view.more.show ? (
          <button type="button" className="bp-decision-more" aria-expanded={view.more.expanded} onClick={() => setExpanded((open) => !open)}>
            {view.more.label}
          </button>
        ) : null}
      </div>
    </>
  );
}
