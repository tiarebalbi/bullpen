"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ui.js";
import { LinkButton } from "./LinkButton.js";
import { useTheme } from "../lib/useTheme.js";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "#series", label: "Series" },
  { href: "#architecture", label: "Architecture" },
  { href: "#decisions", label: "Decisions" },
  { href: "#rules", label: "Rules" },
  { href: "#cost", label: "Cost" },
];

// Bullpen Landing.dc.html collapses these links (and drops the header CTA
// entirely) behind a menu button below desktop width -- confirmed against
// the final design export at 390px. The export has no coded breakpoint of
// its own (no @media rules, no documented breakpoint token anywhere in it),
// so the 900px cutover here is measured from this component's own content:
// brand + links + CTA naturally need ~854px (694px of non-flex content +
// 4 * 24px gaps + 2 * 32px padding) before they'd wrap on one line; 900px
// gives a small safety margin above that measured minimum.
//
// DOM order here (brand, links, spacer, theme toggle, mobile menu button,
// CTA) is the design's real desktop order (~line 47-60 of the export) read
// left to right with no CSS `order` needed at desktop -- the design's own
// live-player-count pill is omitted entirely (no real league yet, see
// content/series.json/Hero), not just visually hidden.
export function Nav(): ReactNode {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="bp-nav">
      <div className="bp-nav__brand">
        <span className="bp-nav__wordmark">Bullpen</span>
        <a href="https://tiarebalbi.com" className="bp-nav__byline">
          by Tiarê Balbi
        </a>
        <a href="https://tiarebalbi.com/en/blog" className="bp-nav__series-link">
          Read the series
        </a>
      </div>
      <nav
        id="bp-nav-links"
        aria-label="Page sections"
        className="bp-nav__links"
        data-open={open ? "true" : "false"}
      >
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="bp-nav__spacer" />
      <ThemeToggle theme={theme} onToggle={toggleTheme} className="bp-nav__theme-toggle" />
      <button
        ref={toggleRef}
        type="button"
        className="bp-nav__toggle"
        aria-expanded={open}
        aria-controls="bp-nav-links"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="bp-nav__toggle-icon" />
      </button>
      <LinkButton href="#series" className="bp-nav__cta">
        League opens in Part 3
      </LinkButton>
    </header>
  );
}
