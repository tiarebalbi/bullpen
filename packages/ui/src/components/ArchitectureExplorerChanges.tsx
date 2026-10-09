import type { CSSProperties, ReactNode } from "react";
import type { ArchChange, ArchPartData } from "./ArchitectureExplorer.types.js";

const MUTED: CSSProperties = { font: "400 13.5px/1.55 var(--font-body)", color: "var(--foreground-muted)" };

const MARK_STYLE: CSSProperties = {
  flex: "none",
  width: 20,
  height: 20,
  borderRadius: 6,
  display: "grid",
  placeItems: "center",
  background: "color-mix(in oklch, var(--bp-gain) 16%, transparent)",
  color: "var(--bp-gain)",
  font: "700 12px/1 var(--font-mono)",
};

const ROW_STYLE: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, font: "500 13.5px/1.35 var(--font-body)" };

const KEY_STYLE: CSSProperties = { font: "500 11px/1.4 var(--font-mono)", color: "var(--foreground-muted)" };

/** The part before `current` (or `current` itself for the first), which "What changed in Part N" compares with however the visitor arrived. */
export function partBefore(partsById: ReadonlyMap<number, ArchPartData>, current: ArchPartData): ArchPartData {
  return partsById.get(current.part - 1) ?? current;
}

/** The line above the list, or the whole panel text when there is nothing to list. */
function introFor(part: ArchPartData): string {
  if (part.part === 1) return "Part 1 is the starting point: one deployable, one live symbol.";
  const noNodes = `No services or connections ${part.status === "built" ? "were" : "are"} added or removed in Part ${part.part}.`;
  const hasChanges = (part.changes ?? []).length > 0;
  return hasChanges ? `${noNodes} What changed are the rules around them:` : noNodes;
}

function ChangeRow({ change, adrTitles, adrHrefs }: { change: ArchChange; adrTitles: Record<string, string>; adrHrefs: Record<string, string> }): ReactNode {
  if (change.kind === "adr") {
    const title = adrTitles[change.adr];
    return (
      <div style={ROW_STYLE}>
        <span style={MARK_STYLE}>+</span>
        <a href={adrHrefs[change.adr] ?? "#"} style={{ color: "var(--foreground)", textDecoration: "none" }}>
          <span style={{ font: "600 12px/1.4 var(--font-mono)", color: "var(--bp-accent-text)" }}>{change.adr}</span>
          {title ? ` — ${title}` : ""}
        </a>
      </div>
    );
  }
  return (
    <div style={ROW_STYLE}>
      <span style={MARK_STYLE}>+</span>
      <div style={{ display: "grid", gap: 6 }}>
        <span>{change.target}</span>
        {change.controls.map((control) => (
          <div key={control.key} style={{ font: "400 13px/1.45 var(--font-body)", color: "var(--foreground-muted)" }}>
            {control.description ?? control.key}
            {control.description ? <div style={KEY_STYLE}>{control.key}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The part's changes under "What changed in Part N" beyond the node diff: the
 * line that says no service or connection was added or removed (cards whose
 * description changed still show above it), then the controls and ADRs
 * the part's moment added. Part 1's starting-point text shows for Part 1 only.
 */
export function PartChanges({
  part,
  nodeChanges,
  adrTitles,
  adrHrefs,
}: {
  part: ArchPartData;
  /** The node diff against the part before: when it adds or removes a service or connection, it says it all. */
  nodeChanges: ReadonlyArray<{ tone: "add" | "remove" | "change" }>;
  adrTitles: Record<string, string>;
  adrHrefs: Record<string, string>;
}): ReactNode {
  const structural = nodeChanges.some((c) => c.tone !== "change");
  const intro = structural ? null : introFor(part);
  return (
    <>
      {intro ? <span style={MUTED}>{intro}</span> : null}
      {(part.changes ?? []).map((change, i) => (
        <ChangeRow key={`${change.kind}-${i}`} change={change} adrTitles={adrTitles} adrHrefs={adrHrefs} />
      ))}
    </>
  );
}
