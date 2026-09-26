import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { DecisionsList } from "./DecisionsList.js";

export function Decisions({ adrs }: { adrs: Adr[] }): ReactNode {
  return (
    <section id="decisions" className="bp-section" aria-labelledby="decisions-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Decisions</div>
        <h2 id="decisions-heading">Written down, then built</h2>
        <p className="bp-section__lede">
          Parsed straight from <code>architecture/adr/</code> at build time. Select any decision to open its full
          record — context, decision, consequences, alternatives and links.
        </p>
      </div>
      <DecisionsList adrs={adrs} />
    </section>
  );
}
