import type { ReactNode } from "react";

export function Footer(): ReactNode {
  return (
    <footer className="bp-web-footer">
      <p>
        Live market data: BTC-USD price via CoinGecko. Alpaca (US stocks) arrives in a later part.
      </p>
    </footer>
  );
}
