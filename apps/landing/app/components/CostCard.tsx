import type { ReactNode } from "react";
import type { AllowanceEntry } from "../../lib/cost.js";
import { PART_1_SERVICES, groupLaterServices, humanAllowance, metricLabel, serviceLabel } from "../../lib/costDisplay.js";

export function CostCard({ allowances }: { allowances: AllowanceEntry[] }): ReactNode {
  const latestChecked = allowances.reduce((latest, a) => (a.checked_on > latest ? a.checked_on : latest), allowances[0]?.checked_on ?? "");
  const part1Allowances = allowances.filter((a) => PART_1_SERVICES.has(a.service));
  const laterServices = groupLaterServices(allowances);

  return (
    <section id="cost" className="bp-bento__card" aria-labelledby="cost-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Cost</div>
          <h2 id="cost-heading">What it costs to run</h2>
        </div>
      </div>
      <p className="bp-bento__note">
        I run Bullpen on free tiers. Here is what it has used so far against each allowance, with a link to
        the page that states each limit.
      </p>

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
            {part1Allowances.map((entry) => (
              <tr key={`${entry.service}-${entry.metric}`}>
                <td>{serviceLabel(entry.service)}</td>
                <td>{metricLabel(entry.metric)}</td>
                <td>{humanAllowance(entry)}</td>
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

        <div className="bp-bento__later">
          <div className="bp-bento__section-label">Arrives in later parts</div>
          <ul>
            {laterServices.map((service) => (
              <li key={service.service}>
                {service.label}
                {service.arrivesInPart ? ` — Part ${service.arrivesInPart}` : " — tracked ahead of time, not yet placed in the plan"}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
