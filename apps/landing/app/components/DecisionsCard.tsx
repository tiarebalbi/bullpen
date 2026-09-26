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
      <DecisionsList adrs={adrs} />
    </section>
  );
}
