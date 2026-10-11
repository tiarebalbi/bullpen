import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { Adr } from "../../lib/adr.js";
import type { AllowanceEntry, UsageSnapshot } from "../../lib/cost.js";
import type { RulesSnapshot } from "../../lib/rulesSnapshot.js";
import { CostCard } from "./CostCard.js";
import { DecisionsCard } from "./DecisionsCard.js";
import { RulesCard } from "./RulesCard.js";
import { UsageCard } from "./UsageCard.js";

/**
 * Decisions, Rules, Cost and Free-tier usage as one bento grid instead of
 * four stacked full-width sections. There's no such layout in this
 * project's design export -- "bento" there is only the nickname for the
 * 20px border-radius token -- so this is built from real content and the
 * existing design tokens, matching only the *structure* the user asked
 * for (a soft outer frame holding four independently-rounded cards).
 */
export function StatusBento({
  adrs,
  adl,
  snapshot,
  allowances,
  usage,
}: {
  adrs: Adr[];
  adl: Adl;
  snapshot: RulesSnapshot | null;
  allowances: AllowanceEntry[];
  usage: UsageSnapshot;
}): ReactNode {
  return (
    <div className="bp-section">
      <div className="bp-bento">
        <DecisionsCard adrs={adrs} />
        <RulesCard adl={adl} allowances={allowances} snapshot={snapshot} />
        <CostCard allowances={allowances} />
        <UsageCard allowances={allowances} usage={usage} />
      </div>
    </div>
  );
}
