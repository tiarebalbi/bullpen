import type { ReactNode } from "react";
import { Leaderboard } from "./components/Leaderboard.js";
import { PriceTicker } from "./components/PriceTicker.js";
import { StockPrices } from "./components/StockPrices.js";

export default function TradingPage(): ReactNode {
  return (
    <main className="bp-app">
      <header className="bp-app__header">
        <h1>Bullpen</h1>
        <p>Trading app</p>
      </header>
      <div className="bp-app__grid">
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          <PriceTicker symbol="BTC-USD" />
          <StockPrices />
        </div>
        <Leaderboard />
      </div>
    </main>
  );
}
