import type { Adr } from "./adr.js";

/** How many decisions the card shows before "View all". */
export const DECISIONS_SHOWN = 6;

export type DecisionsPart = "all" | number;

export interface DecisionTab {
  value: DecisionsPart;
  label: string;
  count: number;
  selected: boolean;
}

export interface DecisionsView {
  /** One tab for All and one for each part that has a decision, built from the ADR files, never from a fixed list. */
  tabs: DecisionTab[];
  /** The part the rows are filtered to (the one asked for, or "all" if it has no decision). */
  part: DecisionsPart;
  rows: Adr[];
  /** How many decisions the filter holds. */
  total: number;
  /** "6 of 7 in Part 3", "6 of 16 decisions". */
  caption: string;
  /** The button under the list: shown only when there is more than the card shows. */
  more: { show: boolean; expanded: boolean; label: string };
}

/**
 * What the Decisions card shows for a filter and an expand state. Pure data in and out, so the
 * counts and captions are tested without a browser. A new ADR changes the tabs and counts with no copy edit.
 */
export function buildDecisionsView(adrs: readonly Adr[], requested: DecisionsPart = "all", expanded = false): DecisionsView {
  const parts = [...new Set(adrs.map((adr) => adr.part))].sort((a, b) => a - b);
  const part: DecisionsPart = requested !== "all" && parts.includes(requested) ? requested : "all";
  const filtered = part === "all" ? [...adrs] : adrs.filter((adr) => adr.part === part);
  const over = filtered.length > DECISIONS_SHOWN;
  const rows = expanded || !over ? filtered : filtered.slice(0, DECISIONS_SHOWN);
  const tabs: DecisionTab[] = [
    { value: "all", label: "All", count: adrs.length, selected: part === "all" },
    ...parts.map((p) => ({ value: p as DecisionsPart, label: `Part ${p}`, count: adrs.filter((adr) => adr.part === p).length, selected: part === p })),
  ];
  return {
    tabs,
    part,
    rows,
    total: filtered.length,
    caption: `${rows.length} of ${filtered.length} ${part === "all" ? "decisions" : `in Part ${part}`}`,
    more: { show: over, expanded: over && expanded, label: over && expanded ? "Show fewer" : `View all ${filtered.length} →` },
  };
}
