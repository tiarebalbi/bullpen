import type { ReactNode } from "react";
import { CookieSettingsButton } from "./ui.js";

export function Footer(): ReactNode {
  return (
    <footer className="bp-footer">
      <p>
        I&rsquo;m building Bullpen in public as the working example for my series{" "}
        <em>Architecting Software in 2026</em>. Paper trading. Play money. Not investment advice.
      </p>
      <p>Market data: crypto by CoinGecko. U.S. stocks arrive in Part 3.</p>
      <p className="bp-footer__legal">
        <a href="/privacy">Privacy</a>
        <span aria-hidden="true"> · </span>
        <CookieSettingsButton />
      </p>
    </footer>
  );
}
