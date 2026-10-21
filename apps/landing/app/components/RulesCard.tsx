import type { ReactNode } from "react";
import type { RuleTiles } from "../../lib/ruleTiles.js";
import { ADL_FILE_HASH } from "./RuleCardGrid.js";

/** The Rules card: how many of the snapshot's rules held, and the snapshot's date and commit. All three come from the committed snapshot. */
export function RulesCard({ tiles }: { tiles: RuleTiles }): ReactNode {
  const failing = tiles.passing < tiles.total;
  return (
    <section id="rules" className="bp-card bp-card--rules" aria-labelledby="rules-heading">
      <div className="bp-eyebrow">Rules</div>
      <h2 id="rules-heading" className="bp-card__title">
        Checked, not hoped for
      </h2>
      <p className="bp-card__note">
        CI runs these checks on every pull request. Each rule is the line from structure.adl as I wrote it, with the result from the last snapshot I committed.
      </p>
      <a className="bp-card__link" href={ADL_FILE_HASH}>
        View structure.adl
      </a>
      <div className="bp-rules-stat">
        {tiles.stamp ? (
          <>
            <div>
              <div className="bp-rules-stat__ratio" data-failing={failing || undefined} aria-label={`${tiles.passing} of ${tiles.total} rules passing`}>
                {tiles.ratio}
              </div>
              <div className="bp-eyebrow bp-rules-stat__label">Rules passing</div>
            </div>
            <div className="bp-rules-stat__when">
              <div>last snapshot</div>
              <div className="bp-rules-stat__stamp">{tiles.stamp}</div>
            </div>
          </>
        ) : (
          <div className="bp-rules-stat__none">No snapshot yet</div>
        )}
      </div>
    </section>
  );
}
