import { join } from "node:path";
import type { ReactNode } from "react";
import { loadAdl } from "../lib/adl.js";
import { loadAdrs } from "../lib/adr.js";
import { loadArchitectureParts } from "../lib/architecture.js";
import { loadAllowances, loadLatestUsage } from "../lib/cost.js";
import { loadCurrentPart } from "../lib/currentPart.js";
import { loadLatestRulesSnapshot } from "../lib/rulesSnapshot.js";
import { loadSeries } from "../lib/series.js";
import { Architecture } from "./components/Architecture.js";
import { Footer } from "./components/Footer.js";
import { JsonLd } from "./components/JsonLd.js";
import { Hero } from "./components/Hero.js";
import { MarketStripSection } from "./components/MarketStripSection.js";
import { Nav } from "./components/Nav.js";
import { PRODUCTION_HOST } from "./lib/productionHost.js";
import { SeriesRail } from "./components/SeriesRail.js";
import { StatusBento } from "./components/StatusBento.js";

// No dynamic APIs (headers/cookies/searchParams) are read below, so Next
// already prerenders this route statically; this just makes that explicit.
export const dynamic = "force-static";

// `next build`/`next dev` run with this package's directory as cwd (true
// under both pnpm --filter and turbo), so the repo root is two levels up.
const repoRoot = join(process.cwd(), "..", "..");

// Written as tags, not as `metadata`: Next resolves the root URL without its
// trailing slash, and the canonical and og:url are meant to be the same URL, slash included.
const HOME_URL = `https://${PRODUCTION_HOST}/`;

export default function LandingPage(): ReactNode {
  const series = loadSeries(join(repoRoot, "content", "series.json"));
  const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
  const architectureParts = loadArchitectureParts(join(repoRoot, "content", "architecture"), join(repoRoot, "architecture", "calm", "planned"), join(repoRoot, "architecture", "calm"));
  // Parsed from architecture/adl/structure.adl by the one ADL parser, which `adl:emit` runs before the build.
  const adl = loadAdl(join(process.cwd(), ".generated", "adl.json"));
  const allowances = loadAllowances(join(repoRoot, "cost", "allowances.json"));
  const usage = loadLatestUsage(join(repoRoot, "cost", "usage"));
  const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"));

  return (
    <>
      <link rel="canonical" href={HOME_URL} />
      <meta property="og:url" content={HOME_URL} />
      <JsonLd page="home" parts={series} />
      <Nav />
      <main>
        <Hero />
        <MarketStripSection />
        <SeriesRail parts={series} />
        <Architecture parts={architectureParts} adrs={adrs} />
        <StatusBento adrs={adrs} adl={adl} snapshot={snapshot} allowances={allowances} usage={usage} builtPart={loadCurrentPart(repoRoot) ?? 1} />
      </main>
      <Footer />
    </>
  );
}
