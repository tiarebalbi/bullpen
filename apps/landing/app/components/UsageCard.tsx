import type { ReactNode } from "react";
import type { AllowanceEntry, UsageSnapshot } from "../../lib/cost.js";
import { joinUsageWithAllowances } from "../../lib/cost.js";
import { PART_1_SERVICES, humanUnit, metricLabel, pendingUsageNote, serviceLabel } from "../../lib/costDisplay.js";

/**
 * Real usage stays 100% pending until week 40 actually happens (see
 * cost/usage/2026-w40.json's own note) -- so this renders no meters at
 * all yet, per the "usage pending, no bars" spec, rather than the
 * design's fictional filled bars (812k/1M, 2.1GB/3GB, ...), which match
 * bullpen.js's sample USAGE array verbatim and were never real Bullpen
 * numbers.
 */
export function UsageCard({ allowances, usage }: { allowances: AllowanceEntry[]; usage: UsageSnapshot }): ReactNode {
  const rows = joinUsageWithAllowances(allowances, usage).filter((row) => PART_1_SERVICES.has(row.allowance.service));
  const note = pendingUsageNote(usage);

  return (
    <section id="cost-usage" className="bp-bento__card" aria-labelledby="cost-usage-heading">
      <div className="bp-bento__head">
        <h2 id="cost-usage-heading" className="bp-eyebrow bp-eyebrow--heading">
          Free-tier usage
        </h2>
        <span className="bp-bento__meta">
          {usage.week} · {usage.period.start} – {usage.period.end} · {usage.status}
        </span>
      </div>

      <div className="bp-usage-rows">
        {rows.map(({ entry, allowance }) => (
          <div key={`${entry.service}-${entry.metric}`} className="bp-usage-row">
            <div className="bp-usage-row__name">
              <span className="bp-usage-row__service">{serviceLabel(allowance.service)}</span>
              <span className="bp-usage-row__metric">{metricLabel(entry.metric)}</span>
            </div>
            <div className="bp-usage-row__value">
              {entry.value === null ? (
                <span className="bp-usage-row__pending">usage pending</span>
              ) : (
                <span>
                  {entry.value.toLocaleString("en-US")} / {allowance.allowance.toLocaleString("en-US")} {humanUnit(allowance.unit)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {note ? <p className="bp-bento__note">{note}</p> : null}
    </section>
  );
}
