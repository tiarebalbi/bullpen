import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { adrHashId } from "../../lib/adrHashId.js";
import type { ArchPartData } from "./ui.js";
import { ArchitectureExplorer } from "./ui.js";

/**
 * Replaces the static, docify-generated SVG with the interactive explorer
 * from Bullpen Architecture.dc.html / Architecture Page.dc.html (see
 * ADR-0006): the landing app no longer renders CALM output directly.
 * Content comes from content/architecture/part-0N.json, which
 * `check:arch`'s explorer-consistency check keeps in sync with the real
 * CALM model in architecture/calm/.
 */
export function Architecture({ parts, adrs }: { parts: ArchPartData[]; adrs: Adr[] }): ReactNode {
  const adrTitles = Object.fromEntries(adrs.map((a) => [a.id, a.title]));
  const adrHrefs = Object.fromEntries(adrs.map((a) => [a.id, `#${adrHashId(a.id)}`]));

  return (
    <section id="architecture" className="bp-section bp-section--sunken" aria-labelledby="architecture-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Architecture</div>
        <h2 id="architecture-heading">The system, part by part</h2>
        <p className="bp-section__lede">
          Scrub through the series to watch the architecture change. Select any node for its purpose,
          decisions and cost. Content comes from <code>content/architecture/</code>, checked against the
          real CALM model on every build.
        </p>
      </div>

      <ArchitectureExplorer parts={parts} adrTitles={adrTitles} adrHrefs={adrHrefs} />
    </section>
  );
}
