"use client";

import { useState, type ReactNode } from "react";
import { TerminalHeader, TerminalShell, ThemeToggle, useTheme } from "@bullpen/ui";
import type { AccountView, LeaderboardSnapshot, PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import { signInWithProvider } from "../lib/auth/actions.js";
import { formatMoney } from "../lib/trading/orderView.js";
import { cancellableOrderId, rankLabel } from "../lib/trading/terminalView.js";
import { useAccount } from "../lib/trading/useAccount.js";
import { useTerminalShortcuts } from "../lib/trading/useTerminalShortcuts.js";
import { usePolled, type Polled } from "../lib/usePolled.js";
import { useWide } from "../lib/useWide.js";
import { AccountPanels } from "./AccountPanels.js";
import { ActiveOrderPanel } from "./ActiveOrder.js";
import { Leaderboard } from "./Leaderboard.js";
import { OrderTicket, TradeBar } from "./OrderTicket.js";
import { PaletteToggle } from "./PaletteToggle.js";
import { RecentFills } from "./RecentFills.js";
import { ShortcutsSheet } from "./ShortcutsSheet.js";
import { SymbolDetail } from "./SymbolDetail.js";
import { BTC_SYMBOL, CryptoSection, MarketStatus, StocksSection } from "./Watchlist.js";

/** The signed-in player in the header: a neutral tile and the "Player ####" label, never a GitHub name or picture. */
export function AvatarSlot({ label }: { label: string }): ReactNode {
  return (
    <span className="bp-avatar" role="img" aria-label={`Signed in as ${label}`}>
      <span className="bp-avatar__tile" aria-hidden="true">{label.slice(-2)}</span>
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

/** The last stored price of a stock; Bitcoin and a stock with no price have none to order against. */
function storedPrice(stocks: Polled<StockPriceSnapshot>, symbol: string): string | null {
  const row = stocks.status === "ok" ? stocks.data.rows.find((r) => r.symbol === symbol) : undefined;
  return row ? row.price : null;
}

/** The three feeds the page reads: the live price, the stored closes and the ranking. */
function useFeeds(): { crypto: Polled<PriceSnapshot>; stocks: Polled<StockPriceSnapshot>; leaderboard: Polled<LeaderboardSnapshot> } {
  return {
    crypto: usePolled<PriceSnapshot>(`/api/price/${BTC_SYMBOL}`, 60_000, "Price unavailable."),
    stocks: usePolled<StockPriceSnapshot>("/api/stock-prices", 5 * 60_000, "Stock prices unavailable."),
    leaderboard: usePolled<LeaderboardSnapshot>("/api/leaderboard", 60_000, "Leaderboard unavailable."),
  };
}

/** The header's right side: the player's figures, the feeds, the toggles and the avatar slot. */
function HeaderBar({ view, rank, crypto }: { view: AccountView | null; rank: string | null; crypto: Polled<PriceSnapshot> }): ReactNode {
  const [theme, toggleTheme] = useTheme();
  return (
    <TerminalHeader title="Trading app">
      <HeaderFigures equity={view ? view.equity : null} rank={rank} />
      <MarketStatus crypto={crypto} />
      <PaletteToggle />
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      {view ? <AvatarSlot label={view.label} /> : null}
    </TerminalHeader>
  );
}

/** The active order and the recent fills: in the rail on the desktop frame, in the main column on a phone. */
function OrderPanels({ view, refresh, confirming, onConfirming }: { view: AccountView; refresh: () => void; confirming: boolean; onConfirming: (open: boolean) => void }): ReactNode {
  return (
    <>
      <ActiveOrderPanel view={view} refresh={refresh} confirming={confirming} onConfirming={onConfirming} />
      <RecentFills view={view} />
    </>
  );
}

export function Terminal(): ReactNode { // metrics-gate: ignore[nesting] -- the depth is the shell's JSX: four regions composed in one place, with the data and the keys already moved into hooks.
  const { crypto, stocks, leaderboard } = useFeeds();
  const { state: account, apply, refresh } = useAccount();
  const [selected, setSelected] = useState(BTC_SYMBOL);
  const wide = useWide();
  const view = account.status === "ok" ? account.account : null;
  const { confirming, setConfirming, help, setHelp } = useTerminalShortcuts(cancellableOrderId(view));

  const ticket = { symbol: selected, price: storedPrice(stocks, selected), account, signIn: signInWithProvider, onAccount: apply, refresh };
  const rank = rankLabel(leaderboard.status === "ok" ? leaderboard.data : null, view ? view.label : null);

  const orderPanels = view ? <OrderPanels view={view} refresh={refresh} confirming={confirming} onConfirming={setConfirming} /> : null;

  return (
    <>
      <TerminalShell
        header={
          <HeaderBar view={view} rank={rank} crypto={crypto} />
        }
        watchlist={
          <>
            <StocksSection polled={stocks} selected={selected} onSelect={setSelected} positions={view?.positions ?? []} />
            <CryptoSection polled={crypto} selected={selected} onSelect={setSelected} />
          </>
        }
        main={
          <>
            <SymbolDetail selected={selected} crypto={crypto} stocks={stocks} />
            <AccountPanels account={account} refresh={refresh} />
            {wide ? null : orderPanels}
            <Leaderboard polled={leaderboard} youLabel={view ? view.label : null} />
          </>
        }
        rail={
          <>
            <OrderTicket {...ticket} />
            {wide ? orderPanels : null}
          </>
        }
        bar={<TradeBar {...ticket} />}
      />
      <ShortcutsSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}
