/**
 * What a built moment added to the previous built one that the explorer's
 * node diff cannot show: controls on nodes and relationships that were already
 * there, and the ADRs the timeline links to the moment. Pure, like the carry
 * (ADR-0011): the landing's loader derives it from the CALM documents and the
 * timeline, so nothing is written by hand and nothing can drift from them.
 */

export interface ControlChange {
  key: string;
  /** The control's own description in the CALM model, if it has one. */
  description?: string;
}

export type MomentChange =
  | { kind: "controls"; target: string; controls: ControlChange[] }
  | { kind: "adr"; adr: string };

interface Controlled {
  "unique-id": string;
  controls?: Record<string, { description?: string }>;
}

/** The slice of a CALM architecture document this module reads. */
export interface CalmChangeDoc {
  nodes?: Array<Controlled & { name?: string }>;
  relationships?: Array<
    Controlled & { "relationship-type"?: { connects?: { source?: { node?: string }; destination?: { node?: string } } } }
  >;
}

/** "ADR-0009" for "architecture/adr/0009-guardrails-enforced-not-requested.md"; null when the path has no ADR number. */
export function adrIdOfFile(file: string): string | null {
  const match = /(?:^|\/)(\d{4})-[^/]*\.md$/.exec(file);
  return match ? `ADR-${match[1]}` : null;
}

function addedControls(before: Controlled | undefined, after: Controlled): ControlChange[] {
  if (!before) return []; // a new node or relationship is reported as added, not as a list of controls
  const had = new Set(Object.keys(before.controls ?? {}));
  const added = Object.entries(after.controls ?? {}).filter(([key]) => !had.has(key));
  return added.map(([key, control]) => (control.description ? { key, description: control.description } : { key }));
}

function controlChange(target: string, controls: ControlChange[]): MomentChange[] {
  return controls.length > 0 ? [{ kind: "controls", target, controls }] : [];
}

function nodeControlChanges(prev: CalmChangeDoc, curr: CalmChangeDoc): MomentChange[] {
  const before = new Map((prev.nodes ?? []).map((n) => [n["unique-id"], n]));
  return (curr.nodes ?? []).flatMap((node) => controlChange(node.name ?? node["unique-id"], addedControls(before.get(node["unique-id"]), node)));
}

function relationshipControlChanges(prev: CalmChangeDoc, curr: CalmChangeDoc): MomentChange[] {
  const names = new Map((curr.nodes ?? []).map((n) => [n["unique-id"], n.name ?? n["unique-id"]]));
  const nameOf = (id: string | undefined): string => (id ? (names.get(id) ?? id) : "?");
  const before = new Map((prev.relationships ?? []).map((r) => [r["unique-id"], r]));
  return (curr.relationships ?? []).flatMap((rel) => {
    const ends = rel["relationship-type"]?.connects;
    const target = ends ? `${nameOf(ends.source?.node)} → ${nameOf(ends.destination?.node)}` : rel["unique-id"];
    return controlChange(target, addedControls(before.get(rel["unique-id"]), rel));
  });
}

function newAdrChanges(prevAdrs: readonly string[], currAdrs: readonly string[]): MomentChange[] {
  const had = new Set(prevAdrs.map(adrIdOfFile));
  const adrs = currAdrs.map(adrIdOfFile).filter((adr): adr is string => adr !== null && !had.has(adr));
  return adrs.map((adr) => ({ kind: "adr", adr }));
}

/** Controls that `curr` has on a node or relationship `prev` already had, then the ADRs `curr` links that `prev` did not. */
export function momentChanges(
  prev: CalmChangeDoc,
  curr: CalmChangeDoc,
  prevAdrs: readonly string[],
  currAdrs: readonly string[],
): MomentChange[] {
  return [...nodeControlChanges(prev, curr), ...relationshipControlChanges(prev, curr), ...newAdrChanges(prevAdrs, currAdrs)];
}
