import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PriceCell } from "./PriceCell.js";
import { formatTime } from "../lib/format.js";

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PriceCell — direction glyph and signed change", () => {
  it("renders an up arrow and a plus sign for a positive change", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="NVDA" price={182.43} changePercent={2.52} timestamp={0} now={0} />);
    const change = screen.getByTestId("price-cell-change");
    expect(change.textContent).toContain("▲");
    expect(change.textContent).toContain("+2.52%");
  });

  it("renders a down arrow and a true Unicode minus (U+2212), never a hyphen, for a negative change", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="TSLA" price={348.1} changePercent={-2.42} timestamp={0} now={0} />);
    const change = screen.getByTestId("price-cell-change");
    expect(change.textContent).toContain("▼");
    expect(change.textContent).toContain("−2.42%");
    expect(change.textContent).not.toContain("-");
  });

  it("treats a zero change as up, with no sign at all", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="SPY" price={668.27} changePercent={0} timestamp={0} now={0} />);
    const change = screen.getByTestId("price-cell-change");
    expect(change.textContent).toContain("▲");
    expect(change.textContent).not.toContain("+");
    expect(change.textContent).not.toContain("−");
  });
});

describe("PriceCell — staleness", () => {
  const now = 1_700_000_000_000;

  it("does not label a fresh quote as stale", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="NVDA" price={182.43} changePercent={2.52} timestamp={now - 5_000} now={now} />);
    expect(screen.queryByTestId("price-cell-stale-label")).not.toBeInTheDocument();
  });

  it("treats exactly 15s old as not yet stale (boundary is exclusive)", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="NVDA" price={182.43} changePercent={2.52} timestamp={now - 15_000} now={now} />);
    expect(screen.queryByTestId("price-cell-stale-label")).not.toBeInTheDocument();
  });

  it("labels a quote stale once its timestamp is older than 15s, and shows that timestamp", () => {
    installMatchMedia(false);
    const timestamp = now - 16_000;
    render(<PriceCell symbol="NVDA" price={182.43} changePercent={2.52} timestamp={timestamp} now={now} />);
    const label = screen.getByTestId("price-cell-stale-label");
    expect(label).toHaveTextContent(/stale/i);
    expect(label).toHaveTextContent(formatTime(timestamp));
  });

  it("flips to stale on its own once real time passes 15s, without a `now` prop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    installMatchMedia(false);
    render(<PriceCell symbol="NVDA" price={182.43} changePercent={2.52} timestamp={0} />);
    expect(screen.queryByTestId("price-cell-stale-label")).not.toBeInTheDocument();

    act(() => {
      vi.setSystemTime(16_000);
      vi.advanceTimersByTime(16_000);
    });

    expect(screen.getByTestId("price-cell-stale-label")).toBeInTheDocument();
  });
});

describe("PriceCell — reduced motion", () => {
  it("does not flash on a price change when prefers-reduced-motion: reduce matches", () => {
    installMatchMedia(true);
    const { rerender } = render(<PriceCell symbol="NVDA" price={100} changePercent={1} timestamp={0} now={0} />);
    rerender(<PriceCell symbol="NVDA" price={101} changePercent={1} timestamp={0} now={0} />);
    expect(screen.getByTestId("price-cell-flash").getAttribute("data-flash")).toBeNull();
  });

  it("does flash on a price change when motion is not reduced (positive control)", () => {
    installMatchMedia(false);
    const { rerender } = render(<PriceCell symbol="NVDA" price={100} changePercent={1} timestamp={0} now={0} />);
    rerender(<PriceCell symbol="NVDA" price={101} changePercent={1} timestamp={0} now={0} />);
    expect(screen.getByTestId("price-cell-flash")).toHaveAttribute("data-flash", "up");
  });
});

describe("PriceCell — flash rate cap", () => {
  it("caps the flash to at most one per 500ms per cell", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    installMatchMedia(false);

    const { rerender } = render(<PriceCell symbol="NVDA" price={100} changePercent={1} timestamp={1_000_000} now={1_000_000} />);

    act(() => {
      vi.setSystemTime(1_000_050);
    });
    rerender(<PriceCell symbol="NVDA" price={101} changePercent={1} timestamp={1_000_050} now={1_000_050} />);
    expect(screen.getByTestId("price-cell-flash")).toHaveAttribute("data-flash", "up");

    // 100ms after the first flash — still inside the 500ms window, so a
    // second, opposite-direction change must NOT re-trigger the flash.
    act(() => {
      vi.setSystemTime(1_000_150);
    });
    rerender(<PriceCell symbol="NVDA" price={99} changePercent={-1} timestamp={1_000_150} now={1_000_150} />);
    expect(screen.getByTestId("price-cell-flash")).toHaveAttribute("data-flash", "up");

    // 650ms after the first flash — outside the window, so this one lands.
    act(() => {
      vi.setSystemTime(1_000_700);
    });
    rerender(<PriceCell symbol="NVDA" price={95} changePercent={-1} timestamp={1_000_700} now={1_000_700} />);
    expect(screen.getByTestId("price-cell-flash")).toHaveAttribute("data-flash", "down");
  });
});

describe("PriceCell — status variants", () => {
  it("renders a loading skeleton instead of a price", () => {
    installMatchMedia(false);
    render(<PriceCell symbol="NVDA" price={0} changePercent={0} timestamp={0} now={0} status="loading" />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("price-cell-price")).not.toBeInTheDocument();
  });

  it("renders the caller-supplied market-closed label instead of a change", () => {
    installMatchMedia(false);
    render(
      <PriceCell
        symbol="MSFT"
        price={512.44}
        changePercent={0.67}
        timestamp={0}
        now={0}
        status="market-closed"
        statusLabel="Close · 16:00 ET"
      />,
    );
    expect(screen.getByText(/Close/)).toBeInTheDocument();
    expect(screen.queryByTestId("price-cell-change")).not.toBeInTheDocument();
  });
});
