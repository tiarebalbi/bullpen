import type { ReactNode } from "react";
import { PriceTicker } from "./components/PriceTicker.js";

export default function TradingPage(): ReactNode {
  return (
    <main>
      <h1>Bullpen</h1>
      <PriceTicker symbol="BTC-USD" />
    </main>
  );
}
