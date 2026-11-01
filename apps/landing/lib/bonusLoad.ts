import { join } from "node:path";
import type { ArchPartData } from "@bullpen/ui";
import type { Adr } from "./adr.js";
import { adrHashId } from "./adrHashId.js";
import { loadBonusPart } from "./architecture.js";

/** The bonus's explorer part for a page, from the repo's own records: its content file, its CALM document and its ADR's change request. Null when there is no bonus. */
export function loadBonusFor(repoRoot: string, adrs: readonly Adr[]): ArchPartData | null {
  const adr = adrs.find((a) => a.part === "bonus" && a.changeRequest);
  return loadBonusPart(join(repoRoot, "content", "architecture"), join(repoRoot, "architecture", "calm"), adr?.changeRequest ? { adr: adr.id, adrHref: `#${adrHashId(adr.id)}`, changeRequest: adr.changeRequest } : null);
}
