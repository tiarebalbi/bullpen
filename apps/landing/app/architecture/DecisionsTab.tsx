"use client";

import { useState, type ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import { DecisionsList } from "../components/DecisionsList.js";

/**
 * The decisions that belong to the parts up to the selected one, each a
 * real ADR that opens in the same modal the home page uses. Scrubbing to a
 * later part brings that part's decisions in.
 */
export function DecisionsTab({ part, adrs }: { part: number; adrs: Adr[] }): ReactNode {
  const [only, setOnly] = useState<number | null>(null);
  const upToPart = adrs.filter((adr) => adr.part <= part);
  const parts = [...new Set(upToPart.map((adr) => adr.part))].sort((a, b) => a - b);
  const effective = only !== null && parts.includes(only) ? only : null;
  const visible = (adr: Adr): boolean => adr.part <= part && (effective === null || adr.part === effective);
  const shown = adrs.filter(visible).length;

  return (
    <section aria-labelledby="bp-ap-decisions-h">
      <div className="bp-ap-tabhead">
        <div>
          <div className="bp-eyebrow">Decisions · Part {part}</div>
          <h2 id="bp-ap-decisions-h">Written down, then built</h2>
        </div>
        <p className="bp-ap-tabhead__help">
          Every decision is an architecture decision record. Open one for its context, the decision, and what it costs.
        </p>
      </div>

      <div className="bp-ap-chips" role="group" aria-label="Filter by part">
        <button type="button" aria-pressed={effective === null} onClick={() => setOnly(null)}>
          All parts
        </button>
        {parts.map((p) => (
          <button key={p} type="button" aria-pressed={effective === p} onClick={() => setOnly(p)}>
            Part {p}
          </button>
        ))}
      </div>
      <p className="bp-ap-muted bp-ap-count">
        {shown} of {adrs.length} records, from the parts up to Part {part}
      </p>

      <DecisionsList adrs={adrs} closeHash="#decisions" rowFilter={visible} />
    </section>
  );
}
