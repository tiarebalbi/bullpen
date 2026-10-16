"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ArchEdgeData, ArchPartData, ArchRateSource } from "./ArchitectureExplorer.types.js";
import { PartChanges, diffWhatChanged } from "./ArchitectureExplorerChanges.js";
import { rateWords } from "./ArchitectureExplorerTraffic.js";

/** The three labels a rate can carry, in the order the sheet shows them, with what each one means. */
export const RATE_GROUPS: ReadonlyArray<{ source: ArchRateSource; title: string; meaning: string }> = [
  { source: "measured", title: "Measured", meaning: "from a load test, not from users" },
  { source: "configured", title: "Configured", meaning: "a schedule or a cap in the repo" },
  { source: "illustrative", title: "Illustrative", meaning: "shows that the connection is used, not how much" },
];

/** The part's rated connections, grouped by where their rate comes from, in the sheet's order; a group with none is left out. */
export function groupByRateSource(part: ArchPartData): Array<{ source: ArchRateSource; title: string; meaning: string; edges: ArchEdgeData[] }> {
  return RATE_GROUPS.map((group) => ({ ...group, edges: part.edges.filter((e) => e.rate?.source === group.source) })).filter((group) => group.edges.length > 0);
}

function Row({ edge, part }: { edge: ArchEdgeData; part: ArchPartData }): ReactNode {
  const label = (id: string): string => part.nodes.find((n) => n.id === id)?.label ?? id;
  const rate = edge.rate!;
  return (
    <li className="bp-traffic-sheet__row" data-edge={edge.id} data-source={rate.source}>
      <span className="bp-traffic-sheet__pair">
        {label(edge.a)} → {label(edge.b)}
      </span>
      <span className="bp-traffic-sheet__rate">{rateWords(rate)}</span>
      <span className="bp-traffic-sheet__basis" title={rate.basis}>
        {rate.basis}
      </span>
    </li>
  );
}

type Section = "changes" | "traffic";

/** Everything the part's changes and traffic say, in two sections of the sheet: the intro and the groups, for traffic. */
function TrafficSection({ part, groups }: { part: ArchPartData; groups: ReturnType<typeof groupByRateSource> }): ReactNode {
  return (
    <>
      <p className="bp-traffic-sheet__intro">
        Each line carries pulses at a rate, and each rate says where it comes from. <strong>Measured</strong> is a load test, not users.{" "}
        <strong>Configured</strong> is a schedule or a cap in the repo. <strong>Illustrative</strong> shows that the connection is used, not how much.
      </p>
      {groups.map((group) => (
        <section key={group.source} aria-label={group.title} data-group={group.source}>
          <h4>
            {group.title} <span>· {group.meaning}</span>
          </h4>
          <ul>
            {group.edges.map((edge) => (
              <Row key={edge.id} edge={edge} part={part} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The side panel when no node is selected, kept to the diagram's height: a short summary and the buttons that open the rest in the sheet. */
function Summary({ part, before, hasTraffic, onOpen }: { part: ArchPartData; before: ArchPartData; hasTraffic: boolean; onOpen: (section: Section, opener: HTMLButtonElement) => void }): ReactNode {
  const changes = diffWhatChanged(before, part);
  const count = (tone: string): number => changes.filter((c) => c.tone === tone).length;
  const decisions = (part.changes ?? []).filter((c) => c.kind === "adr").length;
  const rated = part.edges.filter((e) => e.rate).length;
  return (
    <div className="bp-details-summary">
      <ul className="bp-details-summary__counts" aria-label={`Part ${part.part} at a glance`}>
        <li>
          <strong>{count("add")}</strong> added
        </li>
        <li>
          <strong>{count("change")}</strong> changed
        </li>
        <li>
          <strong>{count("remove")}</strong> removed
        </li>
        {decisions > 0 ? (
          <li>
            <strong>{decisions}</strong> decisions
          </li>
        ) : null}
        {hasTraffic ? (
          <li>
            <strong>{rated}</strong> lines with a rate
          </li>
        ) : null}
      </ul>
      <div className="bp-details-summary__buttons">
        <button type="button" className="bp-traffic-sheet__open" onClick={(e) => onOpen("changes", e.currentTarget)}>
          What changed
        </button>
        {hasTraffic ? (
          <button type="button" className="bp-traffic-sheet__open" onClick={(e) => onOpen("traffic", e.currentTarget)}>
            Traffic details
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The side panel's summary, and the bottom sheet behind it that holds everything long: what changed (the nodes, the controls, the decisions
 * and what week one predicted) and the traffic. A native <dialog>: `showModal()` gives the dimmed overlay, Escape and a focus trap; focus
 * goes back to the button that opened it; the page behind does not scroll; a click on the overlay closes it; the slide is CSS and stops
 * under reduced motion.
 */
export function DetailsSheet({ part, before, adrTitles, adrHrefs }: { part: ArchPartData; before: ArchPartData; adrTitles: Record<string, string>; adrHrefs: Record<string, string> }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [section, setSection] = useState<Section>("changes");
  const groups = groupByRateSource(part);

  const open = (next: Section, from: HTMLButtonElement): void => {
    opener.current = from;
    setSection(next);
    document.documentElement.style.overflow = "hidden";
    dialog.current?.showModal();
  };
  const closed = (): void => {
    document.documentElement.style.overflow = "";
    opener.current?.focus();
  };

  return (
    <>
      <Summary part={part} before={before} hasTraffic={groups.length > 0} onOpen={open} />
      <dialog
        ref={dialog}
        className="bp-traffic-sheet"
        aria-labelledby="bp-sheet-title"
        onClose={closed}
        // Escape closes an open popover first (its own handler does); the sheet closes on the next one.
        onKeyDownCapture={(e) => {
          if (e.key === "Escape" && dialog.current?.querySelector('[role="region"]:not([hidden])')) e.preventDefault();
        }}
        // A click on the dialog itself, outside its content, is a click on the overlay.
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="bp-traffic-sheet__body" data-popover-bounds>
          <header className="bp-traffic-sheet__head">
            <h3 id="bp-sheet-title">Part {part.part} in detail</h3>
            <button type="button" autoFocus aria-label="Close the sheet" className="bp-traffic-sheet__close" onClick={() => dialog.current?.close()}>
              ✕
            </button>
          </header>
          <div className="bp-traffic-sheet__nav" role="group" aria-label="Sections">
            <button type="button" aria-pressed={section === "changes"} onClick={() => setSection("changes")}>
              What changed
            </button>
            {groups.length > 0 ? (
              <button type="button" aria-pressed={section === "traffic"} onClick={() => setSection("traffic")}>
                Traffic
              </button>
            ) : null}
          </div>
          {section === "changes" || groups.length === 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <PartChanges part={part} before={before} adrTitles={adrTitles} adrHrefs={adrHrefs} />
            </div>
          ) : (
            <TrafficSection part={part} groups={groups} />
          )}
        </div>
      </dialog>
    </>
  );
}
