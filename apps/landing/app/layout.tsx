import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bullpen/ui/styles.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "Bullpen — Architecting Software in 2026",
  description:
    "A paper-trading league, built in public. Part 1: the stack, the architecture record, the rules, and what it costs to run.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
