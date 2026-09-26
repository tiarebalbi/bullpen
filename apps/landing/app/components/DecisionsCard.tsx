import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { DecisionsList } from "./DecisionsList.js";

export function DecisionsCard({ adrs }: { adrs: Adr[] }): ReactNode {
  return (
    <section id="decisions" className="bp-bento__card" aria-labelledby="decisions-heading">
      <div className="bp-bento__head">
        <div>
          <div className="bp-eyebrow">Decisions</div>
          <h2 id="decisions-heading">Written down, then built</h2>
        </div>
      </div>
      <p className="bp-bento__note">
        I write every decision down before I build it. Open one to read the context, the decision and what
        it costs.
      </p>
      <DecisionsList adrs={adrs} />
    </section>
  );
}
