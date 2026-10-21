import type { ReactNode } from "react";
import type { UsageView } from "../../lib/costView.js";

/**
 * Free-tier usage for what runs today. A row with no reading says "usage pending" and its track stays empty: there is no bar, and no
 * number, that the snapshot does not hold. The date beside each row is when its allowance was checked.
 */
export function UsageCard({ view }: { view: UsageView }): ReactNode {
  return (
    <section id="cost-usage" className="bp-card bp-card--usage" aria-labelledby="cost-usage-heading">
      <div className="bp-usage-head">
        <h2 id="cost-usage-heading" className="bp-eyebrow bp-eyebrow--heading">
          Free-tier usage
        </h2>
        <span className="bp-usage-head__stamp">
          {view.week} · {view.period} · {view.status}
        </span>
      </div>
      <ul className="bp-usage-list">
        {view.rows.map((row) => (
          <li key={row.key} className="bp-usage-line">
            <div className="bp-usage-line__name">
              <span className="bp-usage-row__service">{row.service}</span>
              <span className="bp-usage-row__metric">{row.metric}</span>
            </div>
            <div className="bp-usage-line__track" aria-hidden="true" />
            <div className="bp-usage-line__value">
              <span className={row.measured ? undefined : "bp-usage-row__pending"}>{row.reading}</span>
              <span className="bp-usage-line__checked">allowance checked {row.checkedOn}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
