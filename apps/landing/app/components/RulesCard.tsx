import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { AllowanceEntry } from "../../lib/cost.js";
import { buildRuleCards, ruleCardChip, ruleCardOutcome } from "../../lib/ruleCards.js";
import type { RulesSnapshot } from "../../lib/rulesSnapshot.js";
import { RuleCardGrid } from "./RuleCardGrid.js";

export function RulesCard({
  adl,
  allowances,
  snapshot,
}: {
  adl: Adl;
  allowances: AllowanceEntry[];
  snapshot: RulesSnapshot | null;
}): ReactNode {
  const cards = buildRuleCards(adl, allowances).map((card) => ({ card, chip: ruleCardChip(card, snapshot) }));
  const knownCount = cards.filter(({ card }) => ruleCardOutcome(card, snapshot) !== null).length;
  const passingCount = cards.filter(({ card }) => ruleCardOutcome(card, snapshot) === true).length;

  return (
    <section id="rules" className="bp-bento__card" aria-labelledby="rules-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Rules</div>
          <h2 id="rules-heading">Checked, not hoped for</h2>
        </div>
        <span className="bp-bento__meta">
          {snapshot ? `${passingCount} of ${knownCount} passing in the last snapshot` : "No snapshot yet"}
        </span>
      </div>
      <p className="bp-bento__note">
        CI runs these checks on every pull request. The results below are from the last snapshot I committed, with the
        date and commit it ran for.
      </p>

      <RuleCardGrid cards={cards} />

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
