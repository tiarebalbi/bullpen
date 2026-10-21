import type { ReactNode } from "react";
import type { Adl } from "../../lib/adl.js";
import type { Adr } from "../../lib/adr.js";
import type { AllowanceEntry, UsageSnapshot } from "../../lib/cost.js";
import { buildCostView, buildUsageView } from "../../lib/costView.js";
import { buildRuleTiles } from "../../lib/ruleTiles.js";
import type { RulesSnapshot } from "../../lib/rulesSnapshot.js";
import { AdlFileModal } from "./AdlFileModal.js";
import { CostCard } from "./CostCard.js";
import { DecisionsCard } from "./DecisionsCard.js";
import { DefinedCard } from "./DefinedCard.js";
import { RuleTiles } from "./RuleTiles.js";
import { RulesCard } from "./RulesCard.js";
import { UsageCard } from "./UsageCard.js";

/**
 * Decisions, Rules, what is defined, the rule tiles and Cost, on the design's twelve-column grid: Decisions takes seven columns and two rows,
 * Rules and What's defined stack in the other five, the eight rule tiles run four to a row, and Cost is a 5/7 pair. Every number on it is read
 * from the repo (the ADR files, structure.adl, the committed snapshot, the cost ledger); a slot with nothing to read says so.
 */
export function StatusBento({
  adrs,
  adl,
  snapshot,
  allowances,
  usage,
  builtPart,
}: {
  adrs: Adr[];
  adl: Adl;
  snapshot: RulesSnapshot | null;
  allowances: AllowanceEntry[];
  usage: UsageSnapshot;
  builtPart: number;
}): ReactNode {
  const tiles = buildRuleTiles(adl, allowances, snapshot);
  return (
    <div className="bp-section">
      <div className="bp-status-grid">
        <DecisionsCard adrs={adrs} />
        <RulesCard tiles={tiles} />
        <DefinedCard adl={adl} />
        <RuleTiles tiles={tiles.tiles} />
      </div>
      <AdlFileModal source={adl.source} lines={adl.lines} />
      <div className="bp-cost-grid">
        <CostCard view={buildCostView(allowances, usage, builtPart)} />
        <UsageCard view={buildUsageView(allowances, usage, builtPart)} />
      </div>
    </div>
  );
}
