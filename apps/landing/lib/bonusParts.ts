import type { ArchPartData } from "@bullpen/ui";

/**
 * The explorer's parts for showing the bonus: the part it follows, renumbered 1, and the bonus, numbered 2. The explorer reads "what changed" and "new in this part"
 * against the part before the one it shows, so the bonus is drawn beside the part it follows and compared with it, whatever the real numbers are. Pure, and free of
 * the file system, so the client components that draw it, and the tests that read it against the real content, all use this one function.
 */
export function explorerPartsWithBonus(parts: readonly ArchPartData[], bonus: ArchPartData): ArchPartData[] {
  const before = parts.find((p) => p.part === bonus.part);
  if (!before) throw new Error(`the bonus follows part ${bonus.part}, which there is no explorer content for`);
  return [{ ...before, part: 1 }, { ...bonus, part: 2 }];
}
