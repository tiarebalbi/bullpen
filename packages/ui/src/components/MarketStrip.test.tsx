import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketStrip } from "./MarketStrip.js";

const CREDIT = { creditLabel: "Powered by CoinGecko", creditHref: "https://www.coingecko.com/en/api" };

describe("MarketStrip", () => {
  it("renders the label and credit in every state", () => {
    render(<MarketStrip label="Live prices" status="loading" {...CREDIT} />);
    expect(screen.getByText("Live prices")).toBeInTheDocument();
    const credit = screen.getByRole("link", { name: "Powered by CoinGecko" });
    expect(credit).toHaveAttribute("href", "https://www.coingecko.com/en/api");
  });

  it("shows a loading placeholder, no price, while loading", () => {
    render(<MarketStrip label="Live prices" status="loading" {...CREDIT} />);
    expect(screen.getByTestId("market-strip-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("market-strip-quote")).not.toBeInTheDocument();
  });

  it("shows the error message and no fabricated price on error", () => {
    render(<MarketStrip label="Live prices" status="error" errorMessage="Price unavailable." {...CREDIT} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Price unavailable.");
    expect(screen.queryByTestId("market-strip-quote")).not.toBeInTheDocument();
  });

  it("renders a live quote with the as-of time and no stale label", () => {
    const timestamp = Date.parse("2026-09-26T14:00:00.000Z");
    render(
      <MarketStrip
        label="Live prices"
        status="live"
        quote={{ symbol: "BTC-USD", kind: "crypto", hue: 65, price: 65432.1, changePercent: 2.34, timestamp }}
        {...CREDIT}
      />,
    );
    expect(screen.getByText("65,432.10")).toBeInTheDocument();
    expect(screen.getByTestId("market-strip-change")).toHaveTextContent("+2.34%");
    expect(screen.getByTestId("market-strip-time")).not.toHaveTextContent("stale");
  });

  it("labels the quote stale when status is stale", () => {
    const timestamp = Date.parse("2026-09-26T14:00:00.000Z");
    render(
      <MarketStrip
        label="Live prices"
        status="stale"
        quote={{ symbol: "BTC-USD", kind: "crypto", hue: 65, price: 65432.1, changePercent: -1.2, timestamp }}
        {...CREDIT}
      />,
    );
    expect(screen.getByTestId("market-strip-time")).toHaveTextContent("stale");
  });
});
