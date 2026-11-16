import type { ReactNode } from "react";

/**
 * The strip under the terminal's header when market data is not flowing (Bullpen Terminal.dc.html and Bullpen Mobile Trading.dc.html, `banner`). A full-width strip on the
 * desktop and a card on the phone, announced as an alert. Two kinds, each with its own glyph and words so it never relies on colour:
 *   reconnecting: ◌ in the warning tone (the stream dropped and the screen keeps the last prices);
 *   offline: ✕ in the destructive tone (nothing has answered and there are no prices).
 * What it says is the caller's: this component draws the strip, and `onRetry` adds the "Retry now" button.
 */
export type MarketDataBannerKind = "reconnecting" | "offline";

export interface MarketDataBannerProps {
  kind: MarketDataBannerKind;
  title: string;
  /** The sentence after the title. */
  children: ReactNode;
  /** Absent, there is no button. */
  onRetry?: () => void;
}

const GLYPH: Record<MarketDataBannerKind, string> = { reconnecting: "◌", offline: "✕" };

export function MarketDataBanner({ kind, title, children, onRetry }: MarketDataBannerProps): ReactNode {
  return (
    <div className="bp-market-banner" role="alert" data-kind={kind}>
      <span className="bp-market-banner__glyph" aria-hidden="true">{GLYPH[kind]}</span>
      <span className="bp-market-banner__body">
        <strong className="bp-market-banner__title">{title}</strong> <span className="bp-market-banner__text">{children}</span>
      </span>
      {onRetry ? (
        <button type="button" className="bp-market-banner__retry" onClick={onRetry}>
          Retry now
        </button>
      ) : null}
    </div>
  );
}
