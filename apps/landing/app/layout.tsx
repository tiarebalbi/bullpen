import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import "./landing.css";
import { join } from "node:path";
import { resolveAnalyticsConfig } from "@bullpen/ui/analytics-config";
import { loadCurrentPart } from "../lib/currentPart.js";
import { AnalyticsHost } from "./components/AnalyticsHost.js";
import { JsonLd } from "./components/JsonLd.js";
import { loadSeries } from "../lib/series.js";
import { PRODUCTION_HOST } from "./lib/productionHost.js";

const TITLE = "Bullpen: Architecting Software in 2026, Built in Public";
const DESCRIPTION =
  "Bullpen is a paper-trading league built in public for Tiarê Balbi's series Architecting Software in 2026, with its architecture, decisions, checks and costs.";

// The image itself, its dimensions and its alt text (opengraph-image.png +
// opengraph-image.alt.txt, both in this directory) are picked up
// automatically by Next's file-convention metadata resolver -- no
// `images` array needed here.
export const metadata: Metadata = {
  metadataBase: new URL(`https://${PRODUCTION_HOST}`),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Bullpen",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Applies the persisted (or default dark, matching the design) theme class
// synchronously, before first paint -- without this, the page would flash
// light-then-dark on every load for a dark-theme visitor. Standard
// inline-script pattern for this; see apps/landing/app/lib/useTheme.ts for
// how the toggle itself keeps this in sync afterward.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("bp-theme");
  if (t !== "light") document.documentElement.classList.add("dark");
} catch (e) {}
`;

// `next build`/`next dev` run with this package's directory as cwd (true under
// both pnpm --filter and turbo), so the repo root is two levels up.
const series = loadSeries(join(process.cwd(), "..", "..", "content", "series.json"));

// Whether a tag may ever load is decided here, on the server, from the
// deployment: production, with the tool's id set. The browser then also
// needs the visitor's consent (see @bullpen/ui's Analytics).
const analyticsConfig = resolveAnalyticsConfig({
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
});
const currentPart = loadCurrentPart(join(process.cwd(), "..", ".."));

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme class below is applied by an
    // inline script based on a persisted preference the server can't see
    // (see THEME_INIT_SCRIPT and app/lib/useTheme.ts) -- an expected,
    // narrowly-scoped mismatch, not a real bug to silence broadly.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <JsonLd parts={series} />
      </head>
      <body>
        {children}
        <AnalyticsHost config={analyticsConfig} part={currentPart} />
      </body>
    </html>
  );
}
