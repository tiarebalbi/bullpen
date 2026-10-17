import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import type { Polled } from "../lib/usePolled.js";
import { SymbolDetail } from "./SymbolDetail.js";

const crypto = (): Polled<PriceSnapshot> => ({ status: "ok", data: { symbol: "BTC-USD", price: 65000, changePercent: 0.5, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() } as PriceSnapshot });
const stocks = (stale = false): Polled<StockPriceSnapshot> => ({ status: "ok", data: { rows: [{ symbol: "AAPL", price: "190.12", asOf: "2026-10-13T20:00:00.000Z", stale }] } });
const none: Polled<StockPriceSnapshot> = { status: "loading" };

describe("SymbolDetail", () => {
  it("shows the live price, its credit, and says there is no history instead of drawing a chart", () => {
    render(<SymbolDetail selected="BTC-USD" crypto={crypto()} stocks={none} />);
    expect(screen.getByTestId("price-cell-price")).toHaveTextContent("65,000.00");
    expect(screen.getByRole("link", { name: "Powered by CoinGecko" })).toBeInTheDocument();
    expect(screen.getByText("No price history yet")).toBeInTheDocument();
  });

  it("shows a stock's close in the market-closed form, with no change figure, and says it is not live", () => {
    render(<SymbolDetail selected="AAPL" crypto={crypto()} stocks={stocks()} />);
    expect(screen.getByTestId("price-cell-price")).toHaveTextContent("190.12");
    expect(screen.getByText("Close · 16:00 ET")).toBeInTheDocument();
    expect(screen.queryByTestId("price-cell-change")).not.toBeInTheDocument();
    expect(screen.getByText(/End-of-day price for Oct 13, not live/)).toBeInTheDocument();
  });

  it("labels a stale close with the date it is as of", () => {
    render(<SymbolDetail selected="AAPL" crypto={crypto()} stocks={stocks(true)} />);
    expect(screen.getByTestId("price-cell-stale-label")).toHaveTextContent("stale · as of Oct 13");
  });

  it("says so when the selected price is not available", () => {
    render(<SymbolDetail selected="AAPL" crypto={crypto()} stocks={none} />);
    expect(screen.getByText("That price is not available right now.")).toBeInTheDocument();
    render(<SymbolDetail selected="BTC-USD" crypto={{ status: "error", httpStatus: 502, message: "x" }} stocks={none} />);
    expect(screen.getByText(/live price is unavailable/)).toBeInTheDocument();
  });
});
