import type { ReactNode } from "react";
import type { AllowanceEntry } from "../../lib/cost.js";

export function CostCard({ allowances }: { allowances: AllowanceEntry[] }): ReactNode {
  const latestChecked = allowances.reduce((latest, a) => (a.checked_on > latest ? a.checked_on : latest), allowances[0]?.checked_on ?? "");

  return (
    <section id="cost" className="bp-bento__card" aria-labelledby="cost-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Cost</div>
          <h2 id="cost-heading">What it costs to run</h2>
        </div>
      </div>

      <div className="bp-cost-figures">
        <div>
          <div className="bp-cost-figure">{allowances.length}</div>
          <div className="bp-cost-figure__label">
            free-tier allowances tracked
            <br />
            checked {latestChecked}
          </div>
        </div>
        <div>
          <div className="bp-cost-figure bp-cost-figure--accent">Part 5</div>
          <div className="bp-cost-figure__label">per-player cost estimate arrives</div>
        </div>
      </div>

      <p className="bp-bento__note">
        Each allowance is read from <code>cost/allowances.json</code> and checked against its schema at build time;
        every figure links to the plan it was verified against.
      </p>

      <details className="bp-bento__more">
        <summary>All {allowances.length} allowances and sources</summary>
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
            {allowances.map((entry) => (
              <tr key={`${entry.service}-${entry.metric}`}>
                <td>{entry.service}</td>
                <td>{entry.metric}</td>
                <td>
                  {entry.allowance.toLocaleString("en-US")} {entry.unit}
                </td>
                <td>
                  <a href={entry.source_url} target="_blank" rel="noopener noreferrer">
                    source
                  </a>
                  <span className="bp-table__muted"> · checked {entry.checked_on}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
