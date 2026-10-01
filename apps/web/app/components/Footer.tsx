import type { ReactNode } from "react";
import { PRIVACY_URL } from "../lib/landingUrl.js";
import { CookieSettingsButton } from "./ui.js";

export function Footer(): ReactNode {
  return (
    <footer className="bp-web-footer">
      <p>
        Live market data: BTC-USD price via CoinGecko. U.S. stocks arrive in Part 3.
      </p>
      <p>
        <a href={PRIVACY_URL}>Privacy</a>
        <span aria-hidden="true"> · </span>
        <CookieSettingsButton />
      </p>
    </footer>
  );
}
