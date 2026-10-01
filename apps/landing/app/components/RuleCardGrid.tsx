import type { ReactNode } from "react";
import type { RuleCardData, RuleChip } from "../../lib/ruleCards.js";
import { Chip } from "./ui.js";

export interface RuleCardView {
  card: RuleCardData;
  chip: RuleChip;
}

/**
 * The Rules mini-cards, as plain data in and markup out. No file reads in
 * here, so the home page (a Server Component) and the architecture page's
 * Rules tab (a Client Component) draw the same cards from the same snapshot.
 */
export function RuleCardGrid({ cards }: { cards: RuleCardView[] }): ReactNode {
  return (
    <div className="bp-rule-grid">
      {cards.map(({ card, chip }) => (
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
      ))}
    </div>
  );
}
