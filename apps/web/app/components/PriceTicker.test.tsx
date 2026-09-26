import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PriceTicker } from "./PriceTicker.js";

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

describe("PriceTicker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the first response resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<PriceTicker symbol="BTC-USD" />);

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders the price and a linked CoinGecko credit, with no stale label when fresh", async () => {
    const now = Date.now();
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        symbol: "BTC-USD",
        price: 65432.1,
        changePercent: 2.34,
        time: new Date(now).toISOString(),
        source: "coingecko",
        fetchedAt: new Date(now).toISOString(),
      }),
    );

    render(<PriceTicker symbol="BTC-USD" />);

    await waitFor(() => expect(screen.getByTestId("price-cell-price")).toHaveTextContent("65,432.10"));

    const credit = screen.getByRole("link", { name: "Powered by CoinGecko" });
    expect(credit).toHaveAttribute("href", "https://www.coingecko.com/en/api");
    expect(screen.queryByTestId("price-cell-stale-label")).not.toBeInTheDocument();
  });

  it("shows the stale label once the price is more than 10 minutes old", async () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        symbol: "BTC-USD",
        price: 65432.1,
        changePercent: 2.34,
        time: new Date(elevenMinutesAgo).toISOString(),
        source: "coingecko",
        fetchedAt: new Date().toISOString(),
      }),
    );

    render(<PriceTicker symbol="BTC-USD" />);

    await waitFor(() => expect(screen.getByTestId("price-cell-stale-label")).toBeInTheDocument());
  });

  it("renders an error state when the route fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({ error: "Market data provider is unavailable." }, false, 503),
    );

    render(<PriceTicker symbol="BTC-USD" />);

    await waitFor(() =>
      expect(screen.getByText("Market data provider is unavailable.")).toBeInTheDocument(),
    );
  });
});
