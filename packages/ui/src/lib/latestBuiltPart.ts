interface PartStatus {
  part: number;
  status: "built" | "planned";
}

/**
 * The part the explorer opens on: the highest-numbered part whose status is
 * "built", read from the explorer content itself. A part is built when its
 * `content/architecture/part-0N.json` says so, so nothing here names a part
 * number and no one has to move a pointer when a part ships.
 *
 * With nothing built it falls back to the first part, so there is always
 * something to show.
 */
export function latestBuiltPart(parts: readonly PartStatus[]): number {
  const built = parts.filter((p) => p.status === "built");
  if (built.length === 0) return parts[0]?.part ?? 1;
  return Math.max(...built.map((p) => p.part));
}
