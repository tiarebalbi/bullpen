import type { ReactNode } from "react";
import { formatPublishDate, type SeriesPart } from "../../lib/series.js";
import { SeriesCard } from "./ui.js";

export function SeriesRail({ parts }: { parts: SeriesPart[] }): ReactNode {
  return (
    <section id="series" className="bp-section" aria-labelledby="series-heading">
      <div className="bp-series-head">
        <div className="bp-section__head">
          <div className="bp-eyebrow">The series</div>
          <h2 id="series-heading">Six parts, one system</h2>
        </div>
        <p className="bp-series-intro">
          Each part changes the architecture for a reason you can see: a new service, a split
          database, an event where there used to be a call.
        </p>
      </div>
      <ol className="bp-series-grid">
        {parts.map((part) => (
          <li key={part.part}>
            <SeriesCard
              part={part.part}
              title={part.title}
              status={part.status}
              introduced={part.introduced}
              date={part.date}
              dateLabel={part.date ? formatPublishDate(part.date) : undefined}
              href={part.url || undefined}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
