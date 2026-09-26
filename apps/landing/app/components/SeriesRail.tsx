import type { ReactNode } from "react";
import type { SeriesPart } from "../../lib/series.js";
import { Chip } from "./ui.js";

export function SeriesRail({ parts }: { parts: SeriesPart[] }): ReactNode {
  return (
    <section id="series" className="bp-section" aria-labelledby="series-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">The series</div>
        <h2 id="series-heading">Six parts, one system</h2>
      </div>
      <ol className="bp-series-grid">
        {parts.map((part) => (
          <li key={part.part} className="bp-series-card">
            <div className="bp-series-card__head">
              <span className="bp-series-card__num">PART {part.part}</span>
              <Chip tone={part.status === "next" ? "accent" : "outline"}>{part.status.toUpperCase()}</Chip>
            </div>
            <div className="bp-series-card__title">{part.title}</div>
            <div className="bp-series-card__foot">{part.url ? null : "Not yet published"}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
