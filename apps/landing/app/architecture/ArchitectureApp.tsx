"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { Adr } from "../../lib/adr.js";
import type { ArchitecturePageData } from "../../lib/architecturePage.js";
import type { RulesTabData } from "../../lib/rulesView.js";
import { ArchitectureExplorer, latestBuiltPart, type ArchPartData } from "../components/ui.js";
import type { RuleCardView } from "../components/RuleCardGrid.js";
import { DataTab } from "./DataTab.js";
import { DecisionsTab } from "./DecisionsTab.js";
import { FlowsTab } from "./FlowsTab.js";
import { PartScrubber } from "./PartScrubber.js";
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

const PLAY_MS = 2400;

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const getHash = (): string => window.location.hash;
const getServerHash = (): string => "";

/** `#services` is the Services tab; `#adr-0003` is a decision, so it opens the Decisions tab; anything else is the Overview. */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, "");
  if (/^adr-\d+$/.test(id)) return "decisions";
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
}

export function ArchitectureApp({ parts, data, adrs, ruleCards, rules, adrTitles, adrHrefs, since }: ArchitectureAppProps): ReactNode {
  const hash = useSyncExternalStore(subscribeToHash, getHash, getServerHash);
  const tab = tabFromHash(hash);
  const last = parts.length;

  // Opens on the latest built part, read from the explorer content, so a part that ships needs no pointer moved.
  const [part, setPart] = useState(latestBuiltPart(parts));
  const [playing, setPlaying] = useState(false);
  // Playback stops by itself at the last part without an effect that sets state.
  const running = playing && part < last;
  const [focusNode, setFocusNode] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setPart((p) => Math.min(p + 1, last)), PLAY_MS);
    return () => clearInterval(id);
  }, [running, last]);

  const select = (next: number): void => {
    setPlaying(false);
    setPart(next);
  };
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
        <PartScrubber parts={data.scrubber} part={part} playing={running} onSelect={select} onTogglePlay={() => {
          if (running) setPlaying(false);
          else {
            if (part >= last) setPart(1);
            setPlaying(true);
          }
        }} />
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
            <h2 className="bp-ap-overview-title">{data.scrubber.find((p) => p.part === part)?.title}</h2>
            <ArchitectureExplorer
              parts={parts}
              part={part}
              onPartChange={select}
              hideScrubber
              initialSelectedId={focusNode ?? undefined}
              adrTitles={adrTitles}
              adrHrefs={adrHrefs}
            />
          </>
        ) : null}
        {tab === "services" ? (
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
        {tab === "flows" ? <FlowsTab key={part} part={part} flow={data.flows[part]!} /> : null}
        {tab === "data" ? <DataTab part={part} data={data.data[part]!} preview={data.data[3]!} onJump={select} /> : null}
        {tab === "decisions" ? <DecisionsTab part={part} adrs={adrs} /> : null}
        {tab === "rules" ? <RulesTab part={part} cards={ruleCards} data={rules} /> : null}
      </div>
    </div>
  );
}
