import { join } from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadAdl } from "../../lib/adl.js";
import { loadAdrs } from "../../lib/adr.js";
import { adrHashId } from "../../lib/adrHashId.js";
import { buildArchitecturePage } from "../../lib/architecturePage.js";
import { loadArchitectureParts } from "../../lib/architecture.js";
import { loadCalmDocs } from "../../lib/calm.js";
import { readPriceCacheSeconds } from "../../lib/priceCache.js";
import { loadAllowances } from "../../lib/cost.js";
import { buildRuleCards, ruleCardChip } from "../../lib/ruleCards.js";
import { loadLatestRulesSnapshot } from "../../lib/rulesSnapshot.js";
import { buildRulesTabData } from "../../lib/rulesView.js";
import { loadSeries } from "../../lib/series.js";
import { Footer } from "../components/Footer.js";
import { Nav } from "../components/Nav.js";
import { ArchitectureApp } from "./ArchitectureApp.js";

// Read at build time from the repo's own records; no dynamic APIs, so the
// route is prerendered. The tab lives in the URL hash, which the browser
// reads after load, so a deep link (#services) needs no server.
export const dynamic = "force-static";

const TITLE = "Bullpen architecture: services, flows, decisions and rules";
const DESCRIPTION =
  "How Bullpen is built, part by part: what runs, how a price request flows, the decisions behind it and the rules that are checked, all read from the repo's own records.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/architecture" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/architecture", siteName: "Bullpen", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const repoRoot = join(process.cwd(), "..", "..");

export default function ArchitecturePage(): ReactNode {
  const parts = loadArchitectureParts(join(repoRoot, "content", "architecture"));
  const series = loadSeries(join(repoRoot, "content", "series.json"));
  const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
  const adl = loadAdl(join(repoRoot, "architecture", "adl", "structure.adl"));
  const allowances = loadAllowances(join(repoRoot, "cost", "allowances.json"));
  const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"));

  const data = buildArchitecturePage({
    parts,
    series: series.map(({ part, title }) => ({ part, title })),
    calm: loadCalmDocs(repoRoot),
    adlRules: adl.rules,
    snapshot,
    cacheSeconds: readPriceCacheSeconds(repoRoot),
  });

  const since: Record<string, number> = {};
  for (const part of parts) for (const node of part.nodes) since[node.id] = Math.min(since[node.id] ?? part.part, part.part);

  return (
    <>
      <Nav onArchitecturePage />
      <main>
        <ArchitectureApp
          parts={parts}
          data={data}
          adrs={adrs}
          ruleCards={buildRuleCards(adl, allowances).map((card) => ({ card, chip: ruleCardChip(card, snapshot) }))}
          rules={buildRulesTabData(snapshot)}
          adrTitles={Object.fromEntries(adrs.map((a) => [a.id, a.title]))}
          adrHrefs={Object.fromEntries(adrs.map((a) => [a.id, `#${adrHashId(a.id)}`]))}
          since={since}
        />
      </main>
      <Footer />
    </>
  );
}
