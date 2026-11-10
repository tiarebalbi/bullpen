"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { AdlLine } from "../../lib/adl.js";
import type { Adr } from "../../lib/adr.js";
import type { ArchitecturePageData } from "../../lib/architecturePage.js";
import type { RulesTabData } from "../../lib/rulesView.js";
import { ArchitectureExplorer, type ArchPartData } from "../components/ui.js";
import { explorerPartsWithBonus } from "../../lib/bonusParts.js";
import { useSeriesPosition } from "./useSeriesPosition.js";
import type { RuleCardView } from "../components/RuleCardGrid.js";
import { DataTab } from "./DataTab.js";
import { DecisionsTab } from "./DecisionsTab.js";
import { FlowsTab } from "./FlowsTab.js";
import { BONUS_NODE_TITLE, PartScrubber, type BonusStop } from "./PartScrubber.js";
import { RulesTab } from "./RulesTab.js";
import { ServicesTab } from "./ServicesTab.js";

const TABS = [
  { id: "overview", label: "Overview", from: 1 },
  { id: "services", label: "Services", from: 1 },
  { id: "flows", label: "Flows", from: 1 },
  { id: "data", label: "Data", from: 3 },
  { id: "decisions", label: "Decisions", from: 1 },
  { id: "rules", label: "Rules", from: 1 },
] as const;

type TabId = (typeof TABS)[number]["id"];

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const getHash = (): string => window.location.hash;
const getServerHash = (): string => "";

/**
 * `#services` is the Services tab; `#adr-0003` is a decision, so it opens the
 * Decisions tab; `#structure-adl` is the ADL file, which the Rules tab opens;
 * anything else is the Overview.
 */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, "");
  if (/^adr-\d+$/.test(id)) return "decisions";
  if (id === "structure-adl") return "rules";
  return TABS.find((tab) => tab.id === id)?.id ?? "overview";
}

export interface ArchitectureAppProps {
  parts: ArchPartData[];
  data: ArchitecturePageData;
  adrs: Adr[];
  ruleCards: RuleCardView[];
  rules: RulesTabData;
  adrTitles: Record<string, string>;
  adrHrefs: Record<string, string>;
  /** The first part each node id appears in, for "Since Part N". */
  since: Record<string, number>;
  /** structure.adl, as the parser read it, for the Rules tab's modal and rows. */
  adl: { source: string; lines: AdlLine[] };
  /** The bonus between two parts (ADR-0027), as an explorer part labelled "the bonus"; absent when the series has none. */
  bonus?: ArchPartData | null;
  /** The bonus's title in the series ("Changing the plan mid-flight"), for the heading above its picture. */
  bonusTitle?: string;
  /** The timeline's current moment is the built bonus, so the page opens with the bonus selected. */
  opensOnBonus?: boolean;
}


export function ArchitectureApp({ parts, data, adrs, ruleCards, rules, adrTitles, adrHrefs, since, adl, bonus = null, bonusTitle, opensOnBonus = false }: ArchitectureAppProps): ReactNode {
  const hash = useSyncExternalStore(subscribeToHash, getHash, getServerHash);
  const tab = tabFromHash(hash);

  // Where the reader is on the series (a part, or the bonus) and whether it plays: shared with the home page's explorer.
  const { part, bonusSelected: bonusOn, running, select, selectBonus, togglePlay } = useSeriesPosition(parts, bonus, opensOnBonus);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  // The bonus lives on the Overview. A link straight to another tab (the server cannot see the hash) opens on the part the bonus follows instead of an empty panel.
  useEffect(() => {
    if (opensOnBonus && bonus && tabFromHash(window.location.hash) !== "overview") select(bonus.part);
    // Once, on arrival: later tab changes keep whatever the reader picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bonusStop: BonusStop | undefined = bonus ? { after: bonus.part, title: BONUS_NODE_TITLE, status: bonus.status } : undefined;
  // The explorer draws the bonus beside the part it follows, so "what changed" and "new in this part" are read against that part.
  const bonusParts: ArchPartData[] = bonus ? explorerPartsWithBonus(parts, bonus) : [];
  const go = (id: TabId): void => {
    window.location.hash = id;
  };

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + offset + TABS.length) % TABS.length]!;
    go(next.id);
    document.getElementById(`bp-ap-tab-${next.id}`)?.focus();
  }

  return (
    <div className="bp-ap">
      <header className="bp-ap__head">
        <div className="bp-eyebrow">Architecture</div>
        <h1>The system, part by part</h1>
        <p>
          I keep Bullpen&rsquo;s shape in the repo, as decisions, rules and a model of what runs. Every tab below reads those records,
          so what you see is what is written down. Scrub through the series to watch it change.
        </p>
      </header>

      <div className="bp-ap__bar">
        <PartScrubber parts={data.scrubber} part={part} bonus={bonusStop} bonusSelected={bonusOn} playing={running} onSelect={select} onSelectBonus={selectBonus} onTogglePlay={togglePlay} />
        <div role="tablist" aria-label="Architecture views" className="bp-ap__tabs" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <a
              key={t.id}
              id={`bp-ap-tab-${t.id}`}
              role="tab"
              href={`#${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="bp-ap-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className="bp-ap__tab"
              onClick={() => setFocusNode(null)}
            >
              {t.label}
              {part < t.from ? <span className="bp-ap__tab-note">Part {t.from}</span> : null}
            </a>
          ))}
        </div>
      </div>

      <div id="bp-ap-panel" role="tabpanel" aria-labelledby={`bp-ap-tab-${tab}`} className="bp-ap__panel">
        {tab === "overview" ? (
          <>
            <h2 className="bp-ap-overview-title">{bonusOn ? (bonusTitle ?? BONUS_NODE_TITLE) : data.scrubber.find((p) => p.part === part)?.title}</h2>
            <ArchitectureExplorer
              key={bonusOn ? "bonus" : "parts"}
              parts={bonusOn ? bonusParts : parts}
              part={bonusOn ? 2 : part}
              onPartChange={bonusOn ? () => undefined : select}
              hideScrubber
              initialSelectedId={focusNode ?? undefined}
              adrTitles={adrTitles}
              adrHrefs={adrHrefs}
            />
          </>
        ) : null}
        {bonusOn && tab !== "overview" ? (
          <p className="bp-ap-bonus-note" role="status">
            The bonus is a detour between Part 4 and Part 5, and it lives on the Overview: its picture of the system, what it changed, and its change request. This tab follows the numbered
            parts. <a href="#overview" onClick={() => setFocusNode(null)}>Back to the bonus</a>, or pick a part above.
          </p>
        ) : null}
        {!bonusOn && tab === "services" ? (
          <ServicesTab
            part={part}
            services={data.services[part]!}
            since={since}
            onOpenNode={(id) => {
              setFocusNode(id);
              go("overview");
            }}
          />
        ) : null}
        {!bonusOn && tab === "flows" ? <FlowsTab key={part} part={part} flows={[data.flows[part]!, ...(data.moreFlows[part] ?? [])]} /> : null}
        {!bonusOn && tab === "data" ? <DataTab part={part} data={data.data[part]!} preview={data.data[3]!} onJump={select} /> : null}
        {!bonusOn && tab === "decisions" ? <DecisionsTab part={part} adrs={adrs} /> : null}
        {!bonusOn && tab === "rules" ? <RulesTab part={part} cards={ruleCards} data={rules} adl={adl} /> : null}
      </div>
    </div>
  );
}
