import type { Adl, AdlKind } from "./adl.js";

export interface DefinedCount {
  kind: AdlKind;
  count: number;
}

const ORDER: readonly AdlKind[] = ["SYSTEM", "COMPONENT", "LIBRARY"];

/** What structure.adl defines, by kind, and the total: read from the parsed file, so a new DEFINE changes the card with no copy edit. */
export function buildDefinedView(adl: Adl): { counts: DefinedCount[]; total: number } {
  const counts = ORDER.map((kind) => ({ kind, count: adl.entries.filter((entry) => entry.kind === kind).length }));
  return { counts, total: counts.reduce((sum, c) => sum + c.count, 0) };
}
