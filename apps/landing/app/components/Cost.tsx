import type { ReactNode } from "react";
import type { AllowanceEntry, UsageSnapshot } from "../../lib/cost.js";
import { Chip } from "./ui.js";

export function Cost({ allowances, usage }: { allowances: AllowanceEntry[]; usage: UsageSnapshot }): ReactNode {
  return (
    <section id="cost" className="bp-section" aria-labelledby="cost-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Cost</div>
        <h2 id="cost-heading">What this costs to run</h2>
        <p className="bp-section__lede">
          Every allowance below is read from <code>cost/allowances.json</code> at build time and checked
          against its schema — the source link is the exact page it was verified against.
        </p>
      </div>

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

      <div className="bp-usage">
        <div className="bp-usage__head">
          <h3 className="bp-rules-subhead">
            Week {usage.week} <span className="bp-table__muted">({usage.period.start} – {usage.period.end})</span>
          </h3>
          <Chip tone={usage.status === "pending" ? "neutral" : "gain"}>{usage.status.toUpperCase()}</Chip>
        </div>
        <table className="bp-table bp-table--cost">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {usage.usage.map((entry) => (
              <tr key={`${entry.service}-${entry.metric}`}>
                <td>{entry.service}</td>
                <td>{entry.metric}</td>
                <td>{entry.value === null ? <em>not yet measured</em> : `${entry.value} ${entry.unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {usage.note ? <p className="bp-usage__note">{usage.note}</p> : null}
      </div>

      <p className="bp-cost-per-player">Cost per player: Estimate arrives in Part 5.</p>
    </section>
  );
}
