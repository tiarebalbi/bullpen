import type { ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { Chip } from "./ui.js";

export function Decisions({ adrs }: { adrs: Adr[] }): ReactNode {
  return (
    <section id="decisions" className="bp-section" aria-labelledby="decisions-heading">
      <div className="bp-section__head">
        <div className="bp-eyebrow">Decisions</div>
        <h2 id="decisions-heading">The record so far</h2>
        <p className="bp-section__lede">
          Parsed straight from <code>architecture/adr/</code> at build time — context and decision excerpts,
          not paraphrases.
        </p>
      </div>
      <div className="bp-adr-list">
        {adrs.map((adr) => (
          <article key={adr.id} className="bp-adr-card">
            <div className="bp-adr-card__head">
              <span className="bp-adr-card__id">{adr.id}</span>
              <Chip tone="gain">{adr.status}</Chip>
              <span className="bp-adr-card__date">{adr.date}</span>
            </div>
            <h3 className="bp-adr-card__title">{adr.title}</h3>
            <p className="bp-adr-card__section">
              <strong>Context.</strong> {adr.contextExcerpt}
            </p>
            <p className="bp-adr-card__section">
              <strong>Decision.</strong> {adr.decisionExcerpt}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
