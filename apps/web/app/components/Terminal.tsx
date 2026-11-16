"use client";

import { useState, type ReactNode } from "react";
import { MarketDataBanner, TerminalShell, useNow } from "@bullpen/ui";
import type { AccountView, LeaderboardSnapshot, PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import { signInWithProvider } from "../lib/auth/actions.js";
import { marketBanner } from "../lib/trading/marketBanner.js";
import { approvedHandleOf, cancellableOrderId, rankLabel } from "../lib/trading/terminalView.js";
import { useAccount } from "../lib/trading/useAccount.js";
import { useTerminalShortcuts } from "../lib/trading/useTerminalShortcuts.js";
import type { LinkState } from "../lib/trading/priceLink.js";
import { useLivePrices } from "../lib/trading/useLivePrices.js";
import { usePolled, type Polled } from "../lib/usePolled.js";
import { useWide } from "../lib/useWide.js";
import { AccountPanels, OrdersAndLeaderboard, Orders } from "./AccountPanels.js";
import { ActiveOrderPanel } from "./ActiveOrder.js";
import { HeaderBar } from "./AppHeader.js";
import { Leaderboard } from "./Leaderboard.js";
import { OrderTicket, TradeBar } from "./OrderTicket.js";
import { RecentFills } from "./RecentFills.js";
import { ShortcutsSheet } from "./ShortcutsSheet.js";
import { SymbolDetail } from "./SymbolDetail.js";
import { BTC_SYMBOL, CryptoSection, StocksSection } from "./Watchlist.js";

export { AvatarSlot, HeaderFigures } from "./AppHeader.js";

/** The last stored price of a stock; Bitcoin and a stock with no price have none to order against. */
function storedPrice(stocks: Polled<StockPriceSnapshot>, symbol: string): string | null {
  const row = stocks.status === "ok" ? stocks.data.rows.find((r) => r.symbol === symbol) : undefined;
  return row ? row.price : null;
}

/** The ISO time of a stock's stored close when that close is stale, else null. */
function staleSince(stocks: Polled<StockPriceSnapshot>, symbol: string): string | null {
  const row = stocks.status === "ok" ? stocks.data.rows.find((r) => r.symbol === symbol) : undefined;
  return row && row.stale ? row.asOf : null;
}

/** The three feeds the page reads: the live price, the stored closes and the ranking. */
function useFeeds(): { crypto: Polled<PriceSnapshot>; stocks: Polled<StockPriceSnapshot>; stocksLink: LinkState; retryStocks: () => void; leaderboard: Polled<LeaderboardSnapshot> } {
  const { stocks, link, retryNow } = useLivePrices();
  return {
    crypto: usePolled<PriceSnapshot>(`/api/price/${BTC_SYMBOL}`, 60_000, "Price unavailable."),
    stocks,
    stocksLink: link,
    retryStocks: retryNow,
    leaderboard: usePolled<LeaderboardSnapshot>("/api/leaderboard", 60_000, "Leaderboard unavailable."),
  };
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
  const { crypto, stocks, stocksLink, retryStocks, leaderboard } = useFeeds();
  const now = useNow();
  const banner = marketBanner(stocksLink, now);
  const { state: account, apply, refresh } = useAccount();
  const [selected, setSelected] = useState(BTC_SYMBOL);
  const wide = useWide();
  const view = account.status === "ok" ? account.account : null;
  const { confirming, setConfirming, help, setHelp } = useTerminalShortcuts(cancellableOrderId(view));

  const ticket = { symbol: selected, price: storedPrice(stocks, selected), account, signIn: signInWithProvider, onAccount: apply, refresh, linkOffline: stocksLink.status === "offline", staleAsOf: staleSince(stocks, selected) };
  const rank = rankLabel(leaderboard.status === "ok" ? leaderboard.data : null, view ? view.label : null);
  const approvedHandle = approvedHandleOf(leaderboard.status === "ok" ? leaderboard.data : null);

  const leaderboardPanel = <Leaderboard polled={leaderboard} youLabel={view ? view.label : null} />;
  const ordersPanel = view ? <Orders view={view} refresh={refresh} /> : null;
  const orderPanels = view ? <OrderPanels view={view} refresh={refresh} confirming={confirming} onConfirming={setConfirming} /> : null;
  const board = { wide, orders: ordersPanel, orderPanels, leaderboard: leaderboardPanel };

  return (
    <>
      <TerminalShell
        header={
          <HeaderBar view={view} rank={rank} approvedHandle={approvedHandle} crypto={crypto} />
        }
        banner={
          banner ? (
            <MarketDataBanner kind={banner.kind} title={banner.title} onRetry={banner.kind === "offline" ? retryStocks : undefined}>
              {banner.text}
              {banner.retryInSeconds !== null ? ` Retrying in ${banner.retryInSeconds} s.` : ""}
            </MarketDataBanner>
          ) : null
        }
        watchlist={
          <>
            <StocksSection polled={stocks} link={stocksLink} onRetry={retryStocks} selected={selected} onSelect={setSelected} positions={view?.positions ?? []} />
            <CryptoSection polled={crypto} selected={selected} onSelect={setSelected} />
          </>
        }
        main={
          <>
            <SymbolDetail selected={selected} crypto={crypto} stocks={stocks} />
            <AccountPanels account={account} refresh={refresh} withOrders={false} />
            <OrdersAndLeaderboard {...board} />
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
