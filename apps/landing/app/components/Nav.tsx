"use client";

import { useState, type ReactNode } from "react";
import { LinkButton } from "./LinkButton.js";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "#series", label: "Series" },
  { href: "#architecture", label: "Architecture" },
  { href: "#decisions", label: "Decisions" },
  { href: "#rules", label: "Rules" },
  { href: "#cost", label: "Cost" },
];

// Bullpen Landing.dc.html collapses these links behind a menu button below
// desktop width (confirmed against the final design export at 390px).
export function Nav(): ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <header className="bp-nav">
      <div className="bp-nav__brand">
        <span className="bp-nav__wordmark">Bullpen</span>
        <span className="bp-nav__byline">by Tiarê Balbi</span>
      </div>
      <button
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
