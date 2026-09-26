import { join } from "node:path";
import type { ReactNode } from "react";
import { loadAdl } from "../lib/adl.js";
import { loadAdrs } from "../lib/adr.js";
import { loadCheckArchResult } from "../lib/check-arch.js";
import { loadAllowances, loadUsage } from "../lib/cost.js";
import { loadSeries } from "../lib/series.js";
import { Architecture } from "./components/Architecture.js";
import { Cost } from "./components/Cost.js";
import { Decisions } from "./components/Decisions.js";
import { Footer } from "./components/Footer.js";
import { Hero } from "./components/Hero.js";
import { Nav } from "./components/Nav.js";
import { Rules } from "./components/Rules.js";
import { SeriesRail } from "./components/SeriesRail.js";

// No dynamic APIs (headers/cookies/searchParams) are read below, so Next
// already prerenders this route statically; this just makes that explicit.
export const dynamic = "force-static";

// `next build`/`next dev` run with this package's directory as cwd (true
// under both pnpm --filter and turbo), so the repo root is two levels up.
const repoRoot = join(process.cwd(), "..", "..");

export default function LandingPage(): ReactNode {
  const series = loadSeries(join(repoRoot, "content", "series.json"));
  const adrs = loadAdrs(join(repoRoot, "architecture", "adr"));
  const adl = loadAdl(join(repoRoot, "architecture", "adl", "structure.adl"));
  const allowances = loadAllowances(join(repoRoot, "cost", "allowances.json"));
  const usage = loadUsage(join(repoRoot, "cost", "usage", "2026-w40.json"));
  const checkArch = loadCheckArchResult(join(process.cwd(), ".generated", "check-arch-result.json"));

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <SeriesRail parts={series} />
        <Architecture plannedParts={series.filter((part) => part.part > 1)} />
        <Decisions adrs={adrs} />
        <Rules adl={adl} checkArch={checkArch} />
        <Cost allowances={allowances} usage={usage} />
      </main>
      <Footer />
    </>
  );
}
