import type { ReactNode } from "react";
import type { CostView } from "../../lib/costView.js";

/** Cost: what I have spent this month (pending until the console is read), the per-player estimate slot (Part 5), and every allowance the count claims. */
export function CostCard({ view }: { view: CostView }): ReactNode {
  return (
    <section id="cost" className="bp-card bp-card--cost" aria-labelledby="cost-heading">
      <div className="bp-eyebrow">Cost</div>
      <h2 id="cost-heading" className="bp-card__title">
        What it costs to run
      </h2>
      <div className="bp-cost-tiles">
        <div>
          <div className="bp-cost-figure bp-cost-figure--word">{view.spend.label}</div>
          <div className="bp-cost-figure__label">Spent this month</div>
        </div>
        <div>
          <div className="bp-cost-figure bp-cost-figure--word bp-cost-figure--accent">{view.perPlayer}</div>
          <div className="bp-cost-figure__label">Per-player cost estimate</div>
        </div>
      </div>
      <p className="bp-card__note">{view.spend.caption}</p>
      <p className="bp-card__note">
        {view.count} free-tier allowances tracked, checked {view.checkedOn}.
      </p>
      <details className="bp-cost-all">
        <summary>All {view.count} allowances and sources</summary>
        <table className="bp-table bp-table--cost">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Metric</th>
              <th scope="col">Allowance</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.key}>
                <td>
                  {row.service}
                  {row.arrivesInPart ? <span className="bp-table__muted"> · Part {row.arrivesInPart}</span> : null}
                </td>
                <td>{row.metric}</td>
                <td>{row.allowance}</td>
                <td>
                  <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
                    source
                  </a>
                  <span className="bp-table__muted"> · checked {row.checkedOn}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
