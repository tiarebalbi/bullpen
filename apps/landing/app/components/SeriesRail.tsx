import type { ReactNode } from "react";
import { formatPlannedDate, formatPublishDate, isBonus, type SeriesEntry } from "../../lib/series.js";
import { SeriesCard } from "./ui.js";

export function SeriesRail({ parts }: { parts: SeriesEntry[] }): ReactNode {
  return (
    <section id="series" className="bp-section" aria-labelledby="series-heading">
      <div className="bp-series-head">
        <div className="bp-section__head">
          <div className="bp-eyebrow">The series</div>
          <h2 id="series-heading">Six parts and a bonus, one system</h2>
        </div>
        <p className="bp-series-intro">
          Each part changes the architecture for a reason you can see: a new service, a new data
          owner, an event where there used to be a call.
        </p>
      </div>
      <ol className="bp-series-grid">
        {parts.map((entry) => (
          <li key={isBonus(entry) ? entry.moment : entry.part}>
            <SeriesCard
              {...(isBonus(entry) ? { bonus: true } : { part: entry.part })}
              title={entry.title}
              status={entry.status}
              introduced={entry.introduced}
              date={entry.date}
              dateLabel={entry.date ? formatPublishDate(entry.date) : undefined}
              {...(entry.plannedDate ? { plannedLabel: formatPlannedDate(entry.plannedDate, isBonus(entry)), plannedDate: entry.plannedDate } : {})}
              href={entry.url || undefined}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
