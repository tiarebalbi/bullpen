import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StockPrices, closeLabel } from "./StockPrices.js";

const respond = (body: unknown, ok = true, status = 200) => vi.fn().mockResolvedValue({ ok, status, json: async () => body });
const rows = [
  { symbol: "AAPL", price: "190.12000000", asOf: "2026-10-13T20:00:00.000Z", stale: false },
  { symbol: "MSFT", price: "410.5", asOf: "2026-10-08T20:00:00.000Z", stale: true },
];

describe("StockPrices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows each symbol's close and the date it is as of, with the data source credited and linked", async () => {
    vi.stubGlobal("fetch", respond({ rows }));
    render(<StockPrices />);

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("190.12")).toBeInTheDocument();
    expect(screen.getByText("Oct 13")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha Vantage" })).toHaveAttribute("href", "https://www.alphavantage.co");
    expect(screen.getByText(/End of day, not live/)).toBeInTheDocument();
  });

  it("labels a stale price stale and a current one end of day, never both", async () => {
    vi.stubGlobal("fetch", respond({ rows }));
    render(<StockPrices />);

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getAllByText("Stale")).toHaveLength(1);
    expect(screen.getByText("older than its close")).toBeInTheDocument();
    expect(screen.getAllByText("Delayed")).toHaveLength(1);
  });

  it("shows the empty state, not placeholder prices, when none have been stored", async () => {
    vi.stubGlobal("fetch", respond({ rows: [] }));
    render(<StockPrices />);

    await waitFor(() => expect(screen.getByText("No end-of-day prices yet")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error state when the route fails", async () => {
    vi.stubGlobal("fetch", respond({ error: "Stock prices unavailable." }, false, 503));
    render(<StockPrices />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Stock prices unavailable"));
  });
});

describe("closeLabel", () => {
  it("names the New York date of the close, not the viewer's", () => {
    expect(closeLabel("2026-10-13T20:00:00.000Z")).toBe("Oct 13");
    expect(closeLabel("2026-10-14T01:30:00.000Z")).toBe("Oct 13"); // still the 13th in New York
  });
});
