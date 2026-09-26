import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TickerBadge } from "./TickerBadge.js";

describe("TickerBadge", () => {
  it("renders the monogram, stripping -USD for crypto pairs", () => {
    render(<TickerBadge symbol="BTC-USD" kind="crypto" hue={65} />);
    expect(screen.getByText("BTC")).toBeInTheDocument();
  });

  it("renders stocks as rounded squares and crypto as pills", () => {
    const { container: stockContainer } = render(<TickerBadge symbol="NVDA" kind="stock" hue={150} />);
    const { container: cryptoContainer } = render(<TickerBadge symbol="BTC-USD" kind="crypto" hue={65} />);
    expect(stockContainer.querySelector(".bp-ticker-badge")).toHaveStyle({ borderRadius: "8px" });
    expect(cryptoContainer.querySelector(".bp-ticker-badge")).toHaveStyle({ borderRadius: "9999px" });
  });

  it("shows a market-closed glyph when marketClosed is set", () => {
    const { container } = render(<TickerBadge symbol="NVDA" kind="stock" hue={150} marketClosed />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
