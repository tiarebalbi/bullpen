"use client";

import { useState, type ReactNode } from "react";
import { OrderTicketLocked, TerminalHeader, TerminalShell, ThemeToggle, TradeBarLocked, useTheme } from "@bullpen/ui";
import type { LeaderboardSnapshot, PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import { usePolled } from "../lib/usePolled.js";
import { Leaderboard } from "./Leaderboard.js";
import { SymbolDetail } from "./SymbolDetail.js";
import { BTC_SYMBOL, CryptoSection, MarketStatus, StocksSection } from "./Watchlist.js";

/** Why the ticket is off, in the words the design's empty states use: it says what is missing and when it arrives. */
export const TICKET_OFF = "Trading opens with sign-in in Part 4";

export function Terminal(): ReactNode {
  const crypto = usePolled<PriceSnapshot>(`/api/price/${BTC_SYMBOL}`, 60_000, "Price unavailable.");
  const stocks = usePolled<StockPriceSnapshot>("/api/stock-prices", 5 * 60_000, "Stock prices unavailable.");
  const leaderboard = usePolled<LeaderboardSnapshot>("/api/leaderboard", 60_000, "Leaderboard unavailable.");
  const [selected, setSelected] = useState(BTC_SYMBOL);
  const [theme, toggleTheme] = useTheme();

  return (
    <TerminalShell
      header={
        <TerminalHeader title="Trading app">
          <MarketStatus crypto={crypto} />
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
          <Leaderboard polled={leaderboard} />
        </>
      }
      rail={<OrderTicketLocked message={TICKET_OFF} />}
      bar={<TradeBarLocked message={TICKET_OFF} />}
    />
  );
}
