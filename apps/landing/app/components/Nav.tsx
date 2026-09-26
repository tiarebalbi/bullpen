"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LinkButton } from "./LinkButton.js";

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
export function Nav(): ReactNode {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

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
        <span className="bp-nav__byline">by Tiarê Balbi</span>
      </div>
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
      <div className="bp-nav__spacer" />
      <LinkButton href="#series" className="bp-nav__cta">
        League opens in Part 3
      </LinkButton>
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
    </header>
  );
}
