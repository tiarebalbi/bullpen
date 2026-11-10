"use client";

import type { ReactNode } from "react";
import { TerminalHeader, ThemeToggle, handleInitials, useTheme } from "@bullpen/ui";
import type { AccountView, PriceSnapshot } from "@bullpen/contracts";
import { formatMoney } from "../lib/trading/orderView.js";
import type { Polled } from "../lib/usePolled.js";
import { PaletteToggle } from "./PaletteToggle.js";
import { MarketStatus } from "./Watchlist.js";

/**
 * The signed-in player in the header: a tile and the "Player ####" label, never a GitHub name or picture. The tile's two characters come from the player's approved
 * handle once there is one (their own, which the ranking shows to everyone), and from the end of the label until then.
 */
export function AvatarSlot({ label, approvedHandle = null }: { label: string; approvedHandle?: string | null }): ReactNode {
  return (
    <span className="bp-avatar" role="img" aria-label={`Signed in as ${label}`}>
      <span className="bp-avatar__tile" aria-hidden="true">{approvedHandle ? handleInitials(approvedHandle) : label.slice(-2)}</span>
      <span className="bp-avatar__label" aria-hidden="true">{label}</span>
    </span>
  );
}

/** Equity and rank, only from what the account and the leaderboard say. No change for today: there is no intraday equity history. */
export function HeaderFigures({ equity, rank }: { equity: string | null; rank: string | null }): ReactNode {
  return (
    <>
      {equity !== null ? (
        <span className="bp-terminal__stat"><span>Equity</span><strong>{formatMoney(equity)}</strong></span>
      ) : null}
      {rank !== null ? (
        <span className="bp-terminal__stat"><span>Rank</span><strong>{rank}</strong></span>
      ) : null}
    </>
  );
}

/** The header's right side: the player's figures, the feeds, the toggles and the avatar slot. */
export function HeaderBar({ title = "Trading app", view, rank, approvedHandle, crypto }: { title?: string; view: AccountView | null; rank: string | null; approvedHandle: string | null; crypto?: Polled<PriceSnapshot> }): ReactNode {
  const [theme, toggleTheme] = useTheme();
  return (
    <TerminalHeader title={title}>
      <HeaderFigures equity={view ? view.equity : null} rank={rank} />
      {crypto ? <MarketStatus crypto={crypto} /> : null}
      <PaletteToggle />
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      {view ? <AvatarSlot label={view.label} approvedHandle={approvedHandle} /> : null}
    </TerminalHeader>
  );
}
