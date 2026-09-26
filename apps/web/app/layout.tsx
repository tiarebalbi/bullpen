import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import { Footer } from "./components/Footer.js";

// This app's own production URL (see BULLPEN_WEB_URL's fallback in
// apps/landing/app/lib/webAppUrl.ts, and PRODUCTION_LANDING_ORIGIN in this
// app's own CORS route, which name the same alias from the other side).
const PRODUCTION_URL = "https://bullpen-web-nine.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_URL),
  title: "Bullpen trading app — live BTC-USD",
  description: "Live BTC-USD price for Bullpen, a paper-trading league built in public for the series Architecting Software in 2026.",
  alternates: {
    canonical: "/",
  },
  // No content here is worth ranking yet -- one live price, no league to
  // join until Part 3. Revisit once there's something real to index.
  robots: { index: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
