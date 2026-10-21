import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import { buildDefinedView } from "../../lib/definedView.js";

/** What structure.adl defines: SYSTEM, COMPONENT and LIBRARY counts and the total, read from the parsed file. */
export function DefinedCard({ adl }: { adl: Adl }): ReactNode {
  const view = buildDefinedView(adl);
  return (
    <section id="defined" className="bp-card bp-card--defined" aria-labelledby="defined-heading">
      <div className="bp-defined__head">
        <h2 id="defined-heading" className="bp-eyebrow bp-eyebrow--heading">
          What&rsquo;s defined
        </h2>
        <span className="bp-defined__total">{view.total} entries</span>
      </div>
      <dl className="bp-defined__counts">
        {view.counts.map((c) => (
          <div key={c.kind}>
            <dt className="bp-defined__kind">{c.kind}</dt>
            <dd className="bp-defined__n">{c.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
