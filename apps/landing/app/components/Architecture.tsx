import type { ReactNode } from "react";
import type { SeriesPart } from "../../lib/series.js";
import { Chip } from "./ui.js";

export function Architecture({ plannedParts }: { plannedParts: SeriesPart[] }): ReactNode {
  return (
    <section id="architecture" className="bp-section bp-section--sunken" aria-labelledby="architecture-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Architecture</div>
        <h2 id="architecture-heading">The system, part by part</h2>
        <p className="bp-section__lede">
          Generated straight from <code>architecture/calm/moments/part-01.architecture.json</code> via FINOS
          CALM — not drawn by hand. A new part changes this diagram for a reason you can point to.
        </p>
      </div>

      <div className="bp-arch-panel">
        {/* A static, build-generated SVG; next/image's optimizer adds nothing here, so a plain <img> is used. */}
        <img
          src="/architecture/part-01.svg"
          alt="Bullpen's Part 1 architecture: reader and player actors, the landing app and trading app, the price snapshot service and the external market-data provider."
          className="bp-arch-panel__img"
        />
      </div>

      <div className="bp-arch-planned">
        <div className="bp-arch-planned__label">Planned, not yet built</div>
        <ul className="bp-arch-planned__list">
          {plannedParts.map((part) => (
            <li key={part.part} className="bp-arch-planned__item">
              <Chip tone="outline">PART {part.part}</Chip>
              <span>{part.title}</span>
              <span className="bp-arch-planned__note">diagram not generated yet</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
