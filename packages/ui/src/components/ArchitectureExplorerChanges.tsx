import { useState, type CSSProperties, type ReactNode } from "react";
import type { ArchChange, ArchPartData, ArchPrediction } from "./ArchitectureExplorer.types.js";
import { ControlChip } from "./ControlChip.js";

type Tone = "add" | "remove" | "change";

export interface NodeChange {
  id: string;
  label: string;
  tone: Tone;
}

/**
 * Nodes added, removed or changed between two parts. A node counts as changed
 * when its name, its type or what it does (purpose, meta) differs. New controls
 * are not node data, so a node whose only change is controls is never "changed":
 * the controls list shows them.
 */
export function diffWhatChanged(prev: ArchPartData, curr: ArchPartData): NodeChange[] {
  if (prev.part === curr.part) return [];
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  const currIds = new Set(curr.nodes.map((n) => n.id));
  // An earlier node a new one says it took over is moved, not removed.
  const movedInto = new Map(curr.nodes.flatMap((n) => (n.replaces ?? []).map((id): [string, string] => [id, n.label])));
  const out: NodeChange[] = [];
  for (const n of curr.nodes) {
    const p = before.get(n.id);
    if (!p) out.push({ id: n.id, label: n.label, tone: "add" });
    else if (p.label !== n.label || p.kind !== n.kind || p.purpose !== n.purpose || p.meta !== n.meta) out.push({ id: n.id, label: n.label, tone: "change" });
  }
  for (const n of prev.nodes) {
    if (currIds.has(n.id)) continue;
    const into = movedInto.get(n.id);
    out.push(into ? { id: n.id, label: `${n.label} (moved into ${into})`, tone: "change" } : { id: n.id, label: n.label, tone: "remove" });
  }
  return out;
}

/** The part before `current` (or `current` itself for the first), which "What changed in Part N" compares with however the visitor arrived. */
export function partBefore(partsById: ReadonlyMap<number, ArchPartData>, current: ArchPartData): ArchPartData {
  return partsById.get(current.part - 1) ?? current;
}

const MUTED: CSSProperties = { font: "400 13.5px/1.55 var(--font-body)", color: "var(--foreground-muted)" };
const ROW: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, font: "500 13.5px/1.35 var(--font-body)" };
const WRAP: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px", minHeight: 20 };

const MARKS: Record<Tone, { glyph: string; background: string; color: string }> = {
  add: { glyph: "+", background: "color-mix(in oklch, var(--bp-gain) 16%, transparent)", color: "var(--bp-gain)" },
  remove: { glyph: "−", background: "color-mix(in oklch, var(--destructive) 12%, transparent)", color: "var(--destructive)" },
  change: { glyph: "~", background: "color-mix(in oklch, var(--ember) 16%, transparent)", color: "var(--bp-accent-text)" },
};

function Mark({ tone }: { tone: Tone }): ReactNode {
  const { glyph, background, color } = MARKS[tone];
  return (
    <span style={{ flex: "none", width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", background, color, font: "700 12px/1 var(--font-mono)" }}>
      {glyph}
    </span>
  );
}

/** A small heading over a group of rows: nodes, the rules on them, the decisions. The first has no space above it. */
function Heading({ children, first = false }: { children: string; first?: boolean }): ReactNode {
  return <h4 style={{ margin: first ? "0 0 2px" : "10px 0 2px", font: "600 10.5px/1 var(--font-body)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--foreground-muted)" }}>{children}</h4>;
}

/** The line above the control rows, or the whole panel text when there is nothing to list. */
function introFor(part: ArchPartData, hasChanges: boolean): string {
  if (part.part === 1) return "Part 1 is the starting point: one deployable, one live symbol.";
  const noNodes = `No services or connections ${part.status === "built" ? "were" : "are"} added or removed in Part ${part.part}.`;
  return hasChanges ? `${noNodes} What changed are the rules around them:` : noNodes;
}

type ControlsChange = Extract<ArchChange, { kind: "controls" }>;

/** The week-one prediction's nodes that were not built, with the tag the prediction is kept at. */
function PredictionRows({ prediction }: { prediction: ArchPrediction }): ReactNode {
  if (prediction.notBuilt.length === 0) return null;
  return (
    <div data-testid="prediction-not-built" style={{ display: "grid", gap: 8, marginTop: 6, paddingTop: 10, borderTop: "1px dashed var(--bp-hair)" }}>
      <span style={{ font: "600 10.5px/1 var(--font-body)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--foreground-muted)" }}>Predicted in week one, not built</span>
      {prediction.notBuilt.map((node) => (
        <div key={node.id} style={{ ...ROW, alignItems: "center", color: "var(--foreground-muted)" }}>
          <Mark tone="remove" />
          {node.label}
        </div>
      ))}
      <a href={prediction.tagUrl} style={{ font: "500 12px/1.4 var(--font-mono)", color: "var(--bp-accent-text)" }}>
        the prediction, at tag {prediction.tag}
      </a>
    </div>
  );
}

function ControlsRow({
  change,
  tone,
  rowId,
  openId,
  setOpenId,
}: {
  change: ControlsChange;
  tone: Tone;
  rowId: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}): ReactNode {
  return (
    <div style={ROW}>
      <Mark tone={tone} />
      <div style={WRAP}>
        <span>{change.target}</span>
        {change.controls.map((control) => {
          const id = `${rowId}:${control.key}`;
          return <ControlChip key={id} control={control} open={openId === id} onOpenChange={(open) => setOpenId(open ? id : null)} />;
        })}
      </div>
    </div>
  );
}

function AdrRow({ adr, adrTitles, adrHrefs }: { adr: string; adrTitles: Record<string, string>; adrHrefs: Record<string, string> }): ReactNode {
  const title = adrTitles[adr];
  return (
    <div style={ROW}>
      <Mark tone="add" />
      <a href={adrHrefs[adr] ?? "#"} style={{ color: "var(--foreground)", textDecoration: "none" }}>
        <span style={{ font: "600 12px/1.4 var(--font-mono)", color: "var(--bp-accent-text)" }}>{adr}</span>
        {title ? ` — ${title}` : ""}
      </a>
    </div>
  );
}

/**
 * The panel under "What changed in Part N", in this order: node changes, the
 * line that says no service or connection was added or removed, one row per
 * node or connection that gained controls (a changed node shows "~" there, once,
 * with its chips), then the ADR rows. Part 1's starting-point text shows for
 * Part 1 only. Each chip opens a popover with the control's description.
 */
export function PartChanges({
  part,
  before,
  adrTitles,
  adrHrefs,
}: {
  part: ArchPartData;
  before: ArchPartData;
  adrTitles: Record<string, string>;
  adrHrefs: Record<string, string>;
}): ReactNode {
  const [openId, setOpenId] = useState<string | null>(null);
  const nodeChanges = diffWhatChanged(before, part);
  const changes = part.changes ?? [];
  const controlRows = changes.filter((c): c is ControlsChange => c.kind === "controls");
  const adrs = changes.filter((c): c is Extract<ArchChange, { kind: "adr" }> => c.kind === "adr");
  const withControls = new Set(controlRows.flatMap((c) => (c.nodeId ? [c.nodeId] : [])));
  const toneOf = new Map(nodeChanges.map((c) => [c.id, c.tone]));
  // A node that is added or changed and carries controls gets one row: its mark, its name and its chips.
  const nodeRows = nodeChanges.filter((c) => !withControls.has(c.id));
  const structural = nodeChanges.some((c) => c.tone !== "change");

  return (
    <>
      {nodeRows.length > 0 ? <Heading first>Services, data and connections</Heading> : null}
      {nodeRows.map((c) => (
        <div key={c.id} style={{ ...ROW, alignItems: "center" }}>
          <Mark tone={c.tone} />
          {c.label}
        </div>
      ))}
      {structural ? null : <span style={MUTED}>{introFor(part, changes.length > 0)}</span>}
      {controlRows.length > 0 ? <Heading first={nodeRows.length === 0 && structural}>{structural ? "New nodes and the rules on them" : "Rules on them"}</Heading> : null}
      {controlRows.map((change, i) => (
        <ControlsRow
          key={`${change.nodeId ?? "rel"}-${i}`}
          change={change}
          tone={(change.nodeId ? toneOf.get(change.nodeId) : undefined) ?? "add"}
          rowId={String(i)}
          openId={openId}
          setOpenId={setOpenId}
        />
      ))}
      {adrs.length > 0 ? <Heading>Decisions</Heading> : null}
      {adrs.map((c) => (
        <AdrRow key={c.adr} adr={c.adr} adrTitles={adrTitles} adrHrefs={adrHrefs} />
      ))}
      {part.prediction ? <PredictionRows prediction={part.prediction} /> : null}
    </>
  );
}
