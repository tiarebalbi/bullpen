"use client";

import type { ReactNode } from "react";

/**
 * The terminal's frame, from "Bullpen Terminal.dc.html": a header across the top, the watchlist on the left, the main panel in the
 * middle and the order ticket's rail on the right. Under 64rem the three stack in that order, and the bar for trading sits pinned
 * to the bottom, as it does on the mobile frames. Layout lives in styles.css (`.bp-terminal*`); a region with nothing to show is not
 * rendered.
 */
export interface TerminalShellProps {
  header: ReactNode;
  watchlist: ReactNode;
  main: ReactNode;
  rail: ReactNode;
  /** Pinned to the bottom of a phone's screen. Hidden at desktop widths. */
  bar?: ReactNode;
}

export function TerminalShell({ header, watchlist, main, rail, bar }: TerminalShellProps): ReactNode {
  return (
    <div className="bp-terminal" data-has-bar={bar ? "" : undefined}>
      <header className="bp-terminal__header">{header}</header>
      <aside className="bp-terminal__watchlist" aria-label="Watchlist">
        {watchlist}
      </aside>
      <main className="bp-terminal__main">{main}</main>
      <aside className="bp-terminal__rail" aria-label="Order ticket">
        {rail}
      </aside>
      {bar ? <div className="bp-terminal__bar">{bar}</div> : null}
    </div>
  );
}

export interface TerminalHeaderProps {
  /** Beside the wordmark: what this is, e.g. "Trading app". */
  title: string;
  /** On the right: statuses and actions. */
  children?: ReactNode;
}

export function TerminalHeader({ title, children }: TerminalHeaderProps): ReactNode {
  return (
    <>
      <div className="bp-terminal__brand">
        <h1>Bullpen</h1>
        <span>{title}</span>
      </div>
      <div className="bp-terminal__header-aside">{children}</div>
    </>
  );
}
