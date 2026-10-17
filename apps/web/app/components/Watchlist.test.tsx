import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PriceSnapshot, StockPriceSnapshot } from "@bullpen/contracts";
import type { Polled } from "../lib/usePolled.js";
import { CryptoSection, StocksSection, closeLabel } from "./Watchlist.js";

const stocks = (rows: StockPriceSnapshot["rows"]): Polled<StockPriceSnapshot> => ({ status: "ok", data: { rows } });
const rows = [
  { symbol: "AAPL", price: "190.12000000", asOf: "2026-10-13T20:00:00.000Z", stale: false },
  { symbol: "MSFT", price: "410.5", asOf: "2026-10-08T20:00:00.000Z", stale: true },
];
const btc = (overrides: Partial<PriceSnapshot> = {}): Polled<PriceSnapshot> => ({ status: "ok", data: { symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString(), ...overrides } as PriceSnapshot });

describe("StocksSection", () => {
  it("lists each symbol with its close date and price, credits the source, and says nothing of gain or loss it does not have", () => {
    render(<StocksSection polled={stocks(rows)} selected="" onSelect={() => undefined} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("190.12")).toBeInTheDocument();
    expect(screen.getByText("Close · Oct 13")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha Vantage" })).toHaveAttribute("href", "https://www.alphavantage.co");
    expect(screen.queryByText(/[▲▼%]/)).not.toBeInTheDocument();
  });

  it("labels a stale price in words, and only the stale one", () => {
    render(<StocksSection polled={stocks(rows)} selected="" onSelect={() => undefined} />);
    expect(screen.getAllByText(/^Stale · /)).toHaveLength(1);
    expect(screen.getByText("Stale · Oct 8")).toBeInTheDocument();
  });

  it("marks the selected row pressed and reports a click with the symbol", () => {
    const onSelect = vi.fn();
    render(<StocksSection polled={stocks(rows)} selected="AAPL" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /^AAPL,/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^MSFT,/ }));
    expect(onSelect).toHaveBeenCalledWith("MSFT");
  });

  it("shows the empty state, not placeholder prices, when none have been stored", () => {
    render(<StocksSection polled={stocks([])} selected="" onSelect={() => undefined} />);
    expect(screen.getByText("No end-of-day prices yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alpha Vantage" })).not.toBeInTheDocument();
  });

  it("says the database is unavailable on a 503, and stock prices are unavailable on another failure", () => {
    const { rerender } = render(<StocksSection polled={{ status: "error", httpStatus: 503, message: "x" }} selected="" onSelect={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
    rerender(<StocksSection polled={{ status: "error", httpStatus: 500, message: "Stock prices unavailable." }} selected="" onSelect={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stock prices unavailable");
  });

  it("shows no rows while it loads", () => {
    render(<StocksSection polled={{ status: "loading" }} selected="" onSelect={() => undefined} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CryptoSection", () => {
  it("shows the live price with a signed change and a direction glyph, and the CoinGecko credit beside it", () => {
    render(<CryptoSection polled={btc()} selected="BTC-USD" onSelect={() => undefined} />);
    expect(screen.getByText("65,432.10")).toBeInTheDocument();
    expect(screen.getByText("▲ +1.25%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Powered by CoinGecko" })).toBeInTheDocument();
  });

  it("uses a down glyph and a true minus for a fall", () => {
    render(<CryptoSection polled={btc({ changePercent: -2.42 })} selected="" onSelect={() => undefined} />);
    expect(screen.getByText("▼ −2.42%")).toBeInTheDocument();
  });

  it("labels a price older than ten minutes stale, in words", () => {
    render(<CryptoSection polled={btc({ time: new Date(Date.now() - 20 * 60_000).toISOString() })} selected="" onSelect={() => undefined} />);
    expect(screen.getAllByText("Stale").length).toBeGreaterThan(0);
  });

  it("shows no credit when there is no price to credit", () => {
    render(<CryptoSection polled={{ status: "error", httpStatus: 502, message: "Market data provider is unavailable." }} selected="" onSelect={() => undefined} />);
    expect(screen.queryByRole("link", { name: "Powered by CoinGecko" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Market data provider is unavailable.");
  });
});

describe("closeLabel", () => {
  it("is the New York date of the close", () => {
    expect(closeLabel("2026-10-13T20:00:00.000Z")).toBe("Oct 13");
  });
});
