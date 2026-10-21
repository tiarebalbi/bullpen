import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { DecisionsBrowser } from "./DecisionsBrowser.js";

export function DecisionsCard({ adrs }: { adrs: Adr[] }): ReactNode {
  return (
    <section id="decisions" className="bp-card bp-card--decisions" aria-labelledby="decisions-heading">
      <div className="bp-eyebrow">Decisions</div>
      <h2 id="decisions-heading" className="bp-card__title">
        Written down, then built
      </h2>
      <p className="bp-card__note">I write every decision down before I build it. Open one to read the context, the decision and what it costs.</p>
      <DecisionsBrowser adrs={adrs} />
    </section>
  );
}
