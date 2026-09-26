import type { ReactNode } from "react";
import { BULLPEN_WEB_URL } from "../lib/webAppUrl.js";
import { EmptyState } from "./ui.js";
import { LinkButton } from "./LinkButton.js";

/**
 * The design export's hero (variant 1j, design/README.md) shows a live
 * "214 players" pill and a fake scrolling leaderboard. Neither is real yet
 * (no live league until Part 3), so this hero drops the player-count pill
 * entirely and replaces the leaderboard with the design system's own
 * EmptyState, using the export's real "Your spot is open" copy rather than
 * fabricated rows. Rendered directly (no extra bordered wrapper) --
 * EmptyState is already a single card in the design; nesting it inside
 * another bordered/padded panel produced a double border, which this fixes.
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
          A paper-trading league with play money, live crypto prices, and U.S. stocks from Part 6. It is
          also the system I&rsquo;m designing in the open for the series{" "}
          <em>Architecting Software in 2026</em>, one part a week.
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
      <EmptyState
        title="Your spot is open"
        description={
          <>
            There&apos;s no live leaderboard yet — the league opens in Part 3. BTC-USD is already live in
            the <a href={BULLPEN_WEB_URL}>trading app</a>.
          </>
        }
      />
    </section>
  );
}
