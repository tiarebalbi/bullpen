import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "Bullpen — Architecting Software in 2026",
  description:
    "A paper-trading league, built in public. Part 1: the stack, the architecture record, the rules, and what it costs to run.",
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme class below is applied by an
    // inline script based on a persisted preference the server can't see
    // (see THEME_INIT_SCRIPT and app/lib/useTheme.ts) -- an expected,
    // narrowly-scoped mismatch, not a real bug to silence broadly.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
