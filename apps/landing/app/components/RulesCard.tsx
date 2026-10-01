import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { AllowanceEntry } from "../../lib/cost.js";
import { buildRuleCards } from "../../lib/ruleCards.js";
import type { RulesSnapshot } from "../../lib/rulesSnapshot.js";
import { AdlFileModal } from "./AdlFileModal.js";
import { RuleCardGrid } from "./RuleCardGrid.js";

/** How many of the snapshot's rules held, and how many it ran. */
function ruleCounts(snapshot: RulesSnapshot): { passing: number; total: number } {
  const rules = snapshot.checks.flatMap((check) => check.rules);
  return { passing: rules.filter((rule) => rule.passed).length, total: rules.length };
}

export function RulesCard({
  adl,
  allowances,
  snapshot,
}: {
  adl: Adl;
  allowances: AllowanceEntry[];
  snapshot: RulesSnapshot | null;
}): ReactNode {
  const cards = buildRuleCards(adl, allowances, snapshot);
  const counts = snapshot ? ruleCounts(snapshot) : null;

  return (
    <section id="rules" className="bp-bento__card" aria-labelledby="rules-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Rules</div>
          <h2 id="rules-heading">Checked, not hoped for</h2>
        </div>
        <span className="bp-bento__meta">
          {counts ? `${counts.passing} of ${counts.total} rules passing in the last snapshot` : "No snapshot yet"}
        </span>
      </div>
      <p className="bp-bento__note">
        CI runs these checks on every pull request. Each rule below is the line from structure.adl as I wrote it, with the
        result from the last snapshot I committed, and the date and commit it ran for.
      </p>

      <RuleCardGrid cards={cards} />
      <AdlFileModal source={adl.source} lines={adl.lines} />

      <details className="bp-bento__more">
        <summary>What&rsquo;s defined ({adl.entries.length})</summary>
        <table className="bp-table">
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Name</th>
              <th scope="col">Path</th>
            </tr>
          </thead>
          <tbody>
            {adl.entries.map((entry) => (
              <tr key={entry.path}>
                <td>{entry.kind}</td>
                <td>{entry.name}</td>
                <td>
                  <code>{entry.path}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
