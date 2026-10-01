import { join } from "node:path";
import type { ReactNode } from "react";
import { loadAdl } from "../lib/adl.js";
import { loadAdrs } from "../lib/adr.js";
import { loadArchitectureParts } from "../lib/architecture.js";
import { loadAllowances, loadUsage } from "../lib/cost.js";
import { loadLatestRulesSnapshot } from "../lib/rulesSnapshot.js";
import { loadSeries } from "../lib/series.js";
import { Architecture } from "./components/Architecture.js";
import { Footer } from "./components/Footer.js";
import { Hero } from "./components/Hero.js";
import { MarketStripSection } from "./components/MarketStripSection.js";
import { Nav } from "./components/Nav.js";
import { SeriesRail } from "./components/SeriesRail.js";
import { StatusBento } from "./components/StatusBento.js";

// No dynamic APIs (headers/cookies/searchParams) are read below, so Next
// already prerenders this route statically; this just makes that explicit.
export const dynamic = "force-static";

// `next build`/`next dev` run with this package's directory as cwd (true
// under both pnpm --filter and turbo), so the repo root is two levels up.
const repoRoot = join(process.cwd(), "..", "..");

export default function LandingPage(): ReactNode {
  const series = loadSeries(join(repoRoot, "content", "series.json"));
  const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
  const architectureParts = loadArchitectureParts(join(repoRoot, "content", "architecture"));
  // Parsed from architecture/adl/structure.adl by the one ADL parser, which `adl:emit` runs before the build.
  const adl = loadAdl(join(process.cwd(), ".generated", "adl.json"));
  const allowances = loadAllowances(join(repoRoot, "cost", "allowances.json"));
  const usage = loadUsage(join(repoRoot, "cost", "usage", "2026-w40.json"));
  const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"));

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <MarketStripSection />
        <SeriesRail parts={series} />
        <Architecture parts={architectureParts} adrs={adrs} />
        <StatusBento adrs={adrs} adl={adl} snapshot={snapshot} allowances={allowances} usage={usage} />
      </main>
      <Footer />
    </>
  );
}
