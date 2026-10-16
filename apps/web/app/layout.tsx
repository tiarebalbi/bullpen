import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import "./web.css";
import { join } from "node:path";
import { resolveAnalyticsConfig } from "@bullpen/ui/analytics-config";
import { THEME_INIT_SCRIPT } from "@bullpen/ui/theme-init";
import { AnalyticsHost } from "./components/AnalyticsHost.js";
import { Footer } from "./components/Footer.js";
import { loadCurrentPart } from "./lib/currentPart.js";

// This app's own production URL (see BULLPEN_WEB_URL's fallback in
// apps/landing/app/lib/webAppUrl.ts, and PRODUCTION_LANDING_ORIGIN in this
// app's own CORS route, which name the same alias from the other side).
const PRODUCTION_URL = "https://bullpen-web-nine.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_URL),
  title: "Bullpen trading app — live BTC-USD and end-of-day stocks",
  description: "Live BTC-USD and end-of-day U.S. stock prices for Bullpen, a paper-trading league built in public for the series Architecting Software in 2026.",
  alternates: {
    canonical: "/",
  },
  // No content here is worth ranking yet -- two kinds of price and a
  // leaderboard with no players until accounts arrive in Part 4. Revisit
  // once there's something real to index.
  robots: { index: false },
};

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
    // suppressHydrationWarning: the inline script puts the saved (or default dark) theme on <html> before first paint, which the server
    // cannot know: an expected, narrow mismatch, not a bug to silence broadly.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Footer />
        <AnalyticsHost config={analyticsConfig} part={currentPart} />
      </body>
    </html>
  );
}
