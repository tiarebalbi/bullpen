"use client";

import { useState, type ReactNode } from "react";
import { TerminalHeader, TerminalShell, ThemeToggle, useTheme } from "@bullpen/ui";
import type { LeaderboardSnapshot, PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import { signInWithProvider } from "../lib/auth/actions.js";
import { useAccount } from "../lib/trading/useAccount.js";
import { usePolled } from "../lib/usePolled.js";
import { AccountPanels } from "./AccountPanels.js";
import { Leaderboard } from "./Leaderboard.js";
import { OrderTicket, TradeBar } from "./OrderTicket.js";
import { PaletteToggle } from "./PaletteToggle.js";
import { SymbolDetail } from "./SymbolDetail.js";
import { BTC_SYMBOL, CryptoSection, MarketStatus, StocksSection } from "./Watchlist.js";

export function Terminal(): ReactNode {
  const crypto = usePolled<PriceSnapshot>(`/api/price/${BTC_SYMBOL}`, 60_000, "Price unavailable.");
  const stocks = usePolled<StockPriceSnapshot>("/api/stock-prices", 5 * 60_000, "Stock prices unavailable.");
  const leaderboard = usePolled<LeaderboardSnapshot>("/api/leaderboard", 60_000, "Leaderboard unavailable.");
  const { state: account, apply, refresh } = useAccount();
  const [selected, setSelected] = useState(BTC_SYMBOL);
  const [theme, toggleTheme] = useTheme();

  // The last stored price of the selected stock; Bitcoin and a stock with no price have none to order against.
  const price = stocks.status === "ok" ? (stocks.data.rows.find((r) => r.symbol === selected)?.price ?? null) : null;
  const ticket = { symbol: selected, price, account, signIn: signInWithProvider, onAccount: apply, refresh };

  return (
    <TerminalShell
      header={
        <TerminalHeader title="Trading app">
          <MarketStatus crypto={crypto} />
          <PaletteToggle />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </TerminalHeader>
      }
      watchlist={
        <>
          <StocksSection polled={stocks} selected={selected} onSelect={setSelected} />
          <CryptoSection polled={crypto} selected={selected} onSelect={setSelected} />
        </>
      }
      main={
        <>
          <SymbolDetail selected={selected} crypto={crypto} stocks={stocks} />
          <AccountPanels account={account} refresh={refresh} />
          <Leaderboard polled={leaderboard} youLabel={account.status === "ok" ? account.account.label : null} />
        </>
      }
      rail={<OrderTicket {...ticket} />}
      bar={<TradeBar {...ticket} />}
    />
  );
}
