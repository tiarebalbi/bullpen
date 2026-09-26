import type { ReactNode } from "react";
import { LinkButton } from "./LinkButton.js";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "#series", label: "Series" },
  { href: "#architecture", label: "Architecture" },
  { href: "#decisions", label: "Decisions" },
  { href: "#rules", label: "Rules" },
  { href: "#cost", label: "Cost" },
];

export function Nav(): ReactNode {
  return (
    <header className="bp-nav">
      <div className="bp-nav__brand">
        <span className="bp-nav__wordmark">Bullpen</span>
        <span className="bp-nav__byline">by Tiarê Balbi</span>
      </div>
      <nav aria-label="Page sections" className="bp-nav__links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="bp-nav__spacer" />
      <LinkButton href="#series" className="bp-nav__cta">
        League opens in Part 3
      </LinkButton>
    </header>
  );
}
