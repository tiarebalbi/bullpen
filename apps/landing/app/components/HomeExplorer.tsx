"use client";

import type { ReactNode } from "react";
import { explorerPartsWithBonus } from "../../lib/bonusParts.js";
import type { ScrubberPart } from "../../lib/architecturePage.js";
import { BONUS_NODE_TITLE, PartScrubber, type BonusStop } from "../architecture/PartScrubber.js";
import { useSeriesPosition } from "../architecture/useSeriesPosition.js";
import { ArchitectureExplorer, track, type ArchPartData } from "./ui.js";

/**
 * The home page's explorer: the same scrubber as the architecture page (`PartScrubber`, with the bonus's diamond node between Part 4 and Part 5) over the
 * explorer, selecting, stepping and playing the same way (`useSeriesPosition`). It reports each move between parts, and does not report the bonus, which has no
 * part number to report. A client component because the callbacks cannot cross from a server one.
 */
export function HomeExplorer({
  parts,
  bonus,
  scrubber,
  adrTitles,
  adrHrefs,
}: {
  parts: ArchPartData[];
  bonus: ArchPartData | null;
  scrubber: ScrubberPart[];
  adrTitles: Record<string, string>;
  adrHrefs: Record<string, string>;
}): ReactNode {
  const { part, bonusSelected, running, select, selectBonus, togglePlay } = useSeriesPosition(parts, bonus);
  const bonusStop: BonusStop | undefined = bonus ? { after: bonus.part, title: BONUS_NODE_TITLE, status: bonus.status } : undefined;
  const shown = bonusSelected && bonus ? explorerPartsWithBonus(parts, bonus) : parts;

  return (
    <div className="bp-home-explorer">
      <PartScrubber parts={scrubber} part={part} bonus={bonusStop} bonusSelected={bonusSelected} playing={running} onSelect={select} onSelectBonus={selectBonus} onTogglePlay={togglePlay} />
      <ArchitectureExplorer
        key={bonusSelected ? "bonus" : "parts"}
        parts={shown}
        part={bonusSelected ? 2 : part}
        onPartChange={bonusSelected ? () => undefined : select}
        hideScrubber
        onPartMoved={bonusSelected ? undefined : (from, to) => track("explorer_moment_change", { from_part: from, to_part: to })}
        adrTitles={adrTitles}
        adrHrefs={adrHrefs}
      />
    </div>
  );
}
