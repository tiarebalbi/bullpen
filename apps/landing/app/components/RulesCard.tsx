import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { CheckArchResult } from "../../lib/check-arch.js";
import type { AllowanceEntry } from "../../lib/cost.js";
import { buildRuleCards, ruleCardChip } from "../../lib/ruleCards.js";
import { Chip } from "./ui.js";

export function RulesCard({
  adl,
  allowances,
  checkArch,
}: {
  adl: Adl;
  allowances: AllowanceEntry[];
  checkArch: CheckArchResult;
}): ReactNode {
  const cards = buildRuleCards(adl, allowances);
  const knownCount = cards.filter((c) => c.resultSource === "check-arch").length;
  const passingCount = cards.filter((c) => c.resultSource === "check-arch" && checkArch.passed).length;

  return (
    <section id="rules" className="bp-bento__card" aria-labelledby="rules-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Rules</div>
          <h2 id="rules-heading">Checked, not hoped for</h2>
        </div>
        <span className="bp-bento__meta">
          {passingCount} of {knownCount} passing at build time
        </span>
      </div>

      <div className="bp-rule-grid">
        {cards.map((card) => {
          const chip = ruleCardChip(card, checkArch);
          return (
            <article key={card.id} className="bp-rule-card">
              <div className="bp-rule-card__file">{card.sourceFile}</div>
              <div className="bp-rule-card__body">
                {card.ruleLines.map((line, i) => (
                  <div key={i}>
                    {line.map((token, j) =>
                      token.keyword ? (
                        <span key={j} className="bp-rule-kw">
                          {token.text}
                        </span>
                      ) : (
                        <span key={j}>{token.text}</span>
                      ),
                    )}
                  </div>
                ))}
                {card.footnote ? <div className="bp-rule-card__footnote">{card.footnote}</div> : null}
              </div>
              <div className="bp-rule-card__foot">
                <span>{card.cadence}</span>
                <Chip tone={chip.tone}>{chip.label}</Chip>
              </div>
            </article>
          );
        })}
      </div>

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
