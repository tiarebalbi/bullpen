/** The pieces of the landing's custom events that can be worked out without a DOM, so they can be tested. */

/** "#adr-0002" -> 2; any other hash -> null. */
export function adrNumberFromHash(hash: string): number | null {
  const match = /^#adr-(\d{4})$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/** The "Part 3" label on a series card -> 3. */
export function seriesPartFromLabel(label: string | null | undefined): number | null {
  const match = /^Part (\d+)$/.exec((label ?? "").trim());
  return match ? Number(match[1]) : null;
}
