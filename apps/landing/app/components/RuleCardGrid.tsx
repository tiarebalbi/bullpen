import type { CSSProperties, ReactNode } from "react";
import { cardChip, ruleChip, type AdlRuleCard, type CheckRuleCard, type RuleCardView } from "../../lib/ruleChips.js";
import { AdlLineText, AdlTokens } from "./AdlSource.js";
import { Chip } from "./ui.js";

export type { RuleCardView } from "../../lib/ruleChips.js";

/** The hash that opens the whole of structure.adl in a modal (see AdlFileModal). */
export const ADL_FILE_HASH = "#structure-adl";

function AdlCard({ view, card, part }: { view: RuleCardView; card: AdlRuleCard; part?: number }): ReactNode {
  const chip = cardChip(view, part);
  return (
    <article className="bp-rule-card bp-rule-card--adl" data-card={card.id}>
      <div className="bp-rule-card__file">
        <span>{card.sourceFile}</span>
        <a className="bp-rule-card__view" href={ADL_FILE_HASH}>
          View structure.adl
        </a>
      </div>
      <div className="bp-rule-card__body bp-adl" role="group" aria-label={card.heading}>
        {card.lines.map((line) => (
          <div key={line.number} className="bp-adl__row" data-line={line.number} data-rule={line.ruleId ?? undefined}>
            <AdlLineText line={line} />
            {line.ruleId ? (
              <span className="bp-adl__result">
                <ResultChip view={view} id={line.ruleId} part={part} />
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="bp-rule-card__foot">
        <span>{card.cadence}</span>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
    </article>
  );
}

function ResultChip({ view, id, part }: { view: RuleCardView; id: string; part?: number }): ReactNode {
  const chip = ruleChip(view.results[id], part);
  return <Chip tone={chip.tone}>{chip.label}</Chip>;
}

function CheckCard({ view, card, part }: { view: RuleCardView; card: CheckRuleCard; part?: number }): ReactNode {
  const chip = cardChip(view, part);
  return (
    <article className="bp-rule-card" data-card={card.id}>
      <div className="bp-rule-card__file">
        <span>{card.sourceFile}</span>
      </div>
      <div className="bp-rule-card__body bp-adl">
        {card.lines.map((tokens, index) => (
          <div key={index} className="bp-adl__line" style={{ "--indent": 0 } as CSSProperties}>
            <AdlTokens tokens={tokens} />
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
}

/**
 * The Rules cards, as plain data in and markup out. No file reads in here, so
 * the home page (a Server Component) and the architecture page's Rules tab
 * (a Client Component) draw the same cards from the same snapshot. With a
 * `part`, a rule that only started failing builds in a later part shows
 * "Arrives in Part N" instead of a result.
 */
export function RuleCardGrid({ cards, part }: { cards: RuleCardView[]; part?: number }): ReactNode {
  return (
    <div className="bp-rule-grid">
      {cards.map((view) =>
        view.card.kind === "adl" ? (
          <AdlCard key={view.card.id} view={view} card={view.card} part={part} />
        ) : (
          <CheckCard key={view.card.id} view={view} card={view.card} part={part} />
        ),
      )}
    </div>
  );
}
