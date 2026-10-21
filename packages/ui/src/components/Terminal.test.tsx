import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderTicketLocked, TradeBarLocked } from "./OrderTicketLocked.js";
import { TerminalHeader, TerminalShell } from "./TerminalShell.js";
import { WatchlistRow, WatchlistSection } from "./WatchlistRow.js";
import { THEME_INIT_SCRIPT } from "../lib/themeInit.js";
import { useTheme } from "../lib/useTheme.js";

describe("TerminalShell", () => {
  it("lays out a header, a watchlist, a main panel and a rail, each as a named landmark", () => {
    render(<TerminalShell header={<TerminalHeader title="Trading app" />} watchlist={<p>w</p>} main={<p>m</p>} rail={<p>r</p>} />);
    expect(screen.getByRole("banner")).toHaveTextContent("Bullpen");
    expect(screen.getByRole("complementary", { name: "Watchlist" })).toHaveTextContent("w");
    expect(screen.getByRole("main")).toHaveTextContent("m");
    expect(screen.getByRole("complementary", { name: "Order ticket" })).toHaveTextContent("r");
  });

  it("renders the bottom bar only when given one, and marks the shell so it reserves room for it", () => {
    const { container, rerender } = render(<TerminalShell header="h" watchlist="w" main="m" rail="r" />);
    expect(container.querySelector(".bp-terminal__bar")).toBeNull();
    expect(container.querySelector(".bp-terminal")).not.toHaveAttribute("data-has-bar");
    rerender(<TerminalShell header="h" watchlist="w" main="m" rail="r" bar={<p>bar</p>} />);
    expect(container.querySelector(".bp-terminal__bar")).toHaveTextContent("bar");
    expect(container.querySelector(".bp-terminal")).toHaveAttribute("data-has-bar");
  });
});

describe("WatchlistRow", () => {
  const row = (overrides = {}) => (
    <WatchlistSection title="Stocks" note="end of day">
      <WatchlistRow symbol="AAPL" kind="stock" hue={235} detail="Close · Oct 13" price={1234.5} selected={false} onSelect={() => undefined} {...overrides} />
    </WatchlistSection>
  );

  it("shows the symbol, what its price is, and the price in tabular figures", () => {
    render(row());
    expect(screen.getByRole("region", { name: "Stocks" })).toHaveTextContent("end of day");
    expect(screen.getByText("Close · Oct 13")).toBeInTheDocument();
    expect(screen.getByText("1,234.50")).toBeInTheDocument();
  });

  it("drops the -USD from a crypto pair, reports the symbol on a click, and marks the selected row pressed", () => {
    const onSelect = vi.fn();
    render(row({ symbol: "BTC-USD", kind: "crypto", selected: true, onSelect }));
    const button = screen.getByRole("button");
    expect(within(button).getAllByText("BTC").length).toBeGreaterThan(0);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("BTC-USD");
  });

  it("names its state in the button's own words, so a screen reader hears stale without seeing a colour", () => {
    render(row({ status: "Stale · Oct 8", stale: true }));
    expect(screen.getByRole("button", { name: /AAPL.*Stale · Oct 8/ })).toBeInTheDocument();
    expect(screen.getByText("Stale · Oct 8")).toBeVisible();
  });

  it("draws no sparkline: nothing in a row is a chart", () => {
    const { container } = render(row());
    expect(container.querySelector("svg path[stroke-dasharray]")).toBeNull();
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });
});

describe("the order ticket while there is no sign-in", () => {
  it("has every control, none of them usable, and says why in words", () => {
    render(<OrderTicketLocked message="Trading opens with sign-in in Part 4" />);
    const ticket = screen.getByRole("form", { name: "Order ticket, not available" });
    // Buy is both the side tab and the one button, so every button is checked, not one by name.
    const buttons = within(ticket).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Buy", "Sell", "Market", "Limit", "Buy"]);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(within(ticket).getByLabelText("Quantity")).toBeDisabled();
    expect(within(ticket).getByRole("status")).toHaveTextContent("Trading opens with sign-in in Part 4");
  });

  it("shows no cost and no buying power, because there is no account to take them from", () => {
    render(<OrderTicketLocked message="m" />);
    const sums = screen.getByText("Estimated cost").closest("div")!.parentElement!;
    expect(sums.textContent).not.toMatch(/\d/);
  });

  it("cannot be submitted", () => {
    const { container } = render(<OrderTicketLocked message="m" />);
    const submit = vi.fn();
    container.querySelector("form")!.addEventListener("submit", submit);
    fireEvent.submit(container.querySelector("form")!);
    expect(container.querySelector("fieldset")).toBeDisabled();
  });

  it("is the same off switch on a phone: Sell and Buy, disabled, with the reason", () => {
    render(<TradeBarLocked message="Trading opens with sign-in in Part 4" />);
    expect(screen.getByRole("button", { name: "Sell" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(screen.getByText("Trading opens with sign-in in Part 4")).toBeVisible();
  });
});

describe("useTheme", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("starts from the class the inline script put on <html>, and toggles it and the stored preference together", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
    act(() => result.current[1]());
    expect(result.current[0]).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("bp-theme")).toBe("light");
    act(() => result.current[1]());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("bp-theme")).toBe("dark");
  });

  it("has an init script that makes dark the default and only an explicit light turns it off", () => {
    expect(THEME_INIT_SCRIPT).toContain('!== "light"');
    const run = (stored: string | null): boolean => {
      document.documentElement.classList.remove("dark");
      if (stored) window.localStorage.setItem("bp-theme", stored);
      new Function(THEME_INIT_SCRIPT)();
      return document.documentElement.classList.contains("dark");
    };
    expect(run(null)).toBe(true);
    expect(run("light")).toBe(false);
    window.localStorage.clear();
    expect(run("dark")).toBe(true);
  });
});
