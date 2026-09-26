import type { ReactNode } from "react";
import { EmptyState } from "./ui.js";
import { LinkButton } from "./LinkButton.js";

/**
 * The design export's hero (variant 1j, design/README.md) shows a live
 * "214 players" pill and a fake scrolling leaderboard. Neither is real yet
 * (issue #6: no live symbol, no live player data — Coinbase's terms forbid
 * public display of their data and no replacement source is chosen), so
 * this hero drops the player-count pill entirely and replaces the
 * leaderboard with the design system's own EmptyState, using the export's
 * real "Your spot is open" copy rather than fabricated rows.
 */
export function Hero(): ReactNode {
  return (
    <section className="bp-hero" aria-labelledby="hero-heading">
      <div className="bp-hero__copy">
        <div className="bp-eyebrow">A series in six parts · this is Part 1</div>
        <h1 id="hero-heading" className="bp-hero__heading">
          Architecting software in 2026, <span className="bp-accent">built in public</span>
        </h1>
        <p className="bp-hero__sub">
          A paper-trading league: play money, real US stocks and crypto at live prices, and a live
          leaderboard. Built in public for the blog series <em>Architecting Software in 2026</em>, one
          part at a time.
        </p>
        <div className="bp-hero__ctas">
          <LinkButton variant="primary" href="#series">
            League opens in Part 3
          </LinkButton>
          <LinkButton variant="secondary" href="#architecture">
            Explore the architecture
          </LinkButton>
        </div>
        <p className="bp-hero__disclaimer">Paper trading. Play money. Not investment advice.</p>
      </div>
      <div className="bp-hero__panel">
        <EmptyState
          title="Your spot is open"
          description="There's no live leaderboard yet. The trading app's one live symbol is blocked on a compliant market-data source — Coinbase's terms forbid public display of their data, and no replacement has been chosen (issue #6)."
        />
      </div>
    </section>
  );
}
