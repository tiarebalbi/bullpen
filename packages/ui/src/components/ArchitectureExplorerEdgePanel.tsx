"use client";

import { useState, type ReactNode } from "react";
import type { ArchEdgeData, ArchPartData } from "./ArchitectureExplorer.types.js";
import { rateText } from "./ArchitectureExplorerTraffic.js";

/** Which line the reader clicked, and in which part, so a line chosen in one part is not shown in another. */
export function useEdgeSelection(): { select: (part: number, id: string) => void; clear: () => void; edgeIn: (part: ArchPartData) => ArchEdgeData | null } {
  const [selected, setSelected] = useState<{ part: number; id: string } | null>(null);
  return {
    select: (part, id) => setSelected({ part, id }),
    clear: () => setSelected(null),
    edgeIn: (part) => (selected && selected.part === part.part ? (part.edges.find((e) => e.id === selected.id) ?? null) : null),
  };
}

/** The side panel for a clicked line: what it joins, how it is called, and its rate with where the rate comes from. */
export function EdgePanel({ part, edge, onClose }: { part: ArchPartData; edge: ArchEdgeData; onClose: () => void }): ReactNode {
  const label = (id: string): string => part.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <aside aria-label="Details" className="bp-edge-panel bp-arch-explorer__side">
      <div className="bp-edge-panel__head">
        <span>Connection · {edge.type === "async" ? "asynchronous" : "synchronous"}</span>
        <button type="button" aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>
      <h3 className="bp-edge-panel__title">
        {label(edge.a)} → {label(edge.b)}
      </h3>
      {edge.caption ? <p className="bp-edge-panel__line">{edge.caption}</p> : null}
      {edge.label ? <p className="bp-edge-panel__line">{edge.label}</p> : null}
      <h4>Traffic</h4>
      <p className="bp-edge-panel__rate" data-source={edge.rate?.source}>
        {edge.rate ? rateText(edge.rate) : "No rate is recorded for this connection."}
      </p>
    </aside>
  );
}
