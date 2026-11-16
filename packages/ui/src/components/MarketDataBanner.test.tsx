import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketDataBanner } from "./MarketDataBanner.js";

describe("MarketDataBanner", () => {
  it("is an alert with its title, its sentence and a glyph that is not colour: ◌ while reconnecting", () => {
    render(<MarketDataBanner kind="reconnecting" title="Reconnecting to market data.">Prices shown are the last received.</MarketDataBanner>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-kind", "reconnecting");
    expect(alert).toHaveTextContent("Reconnecting to market data. Prices shown are the last received.");
    expect(alert.querySelector(".bp-market-banner__glyph")).toHaveTextContent("◌");
    expect(alert.querySelector(".bp-market-banner__glyph")).toHaveAttribute("aria-hidden", "true");
  });

  it("is ✕ in the destructive kind, with a Retry now button only when it is given one", () => {
    const retry = vi.fn();
    const { rerender } = render(<MarketDataBanner kind="offline" title="You’re offline.">Retrying in 8 s.</MarketDataBanner>);
    expect(screen.getByRole("alert").querySelector(".bp-market-banner__glyph")).toHaveTextContent("✕");
    expect(screen.queryByRole("button", { name: "Retry now" })).toBeNull();
    rerender(<MarketDataBanner kind="offline" title="You’re offline." onRetry={retry}>Retrying in 8 s.</MarketDataBanner>);
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
