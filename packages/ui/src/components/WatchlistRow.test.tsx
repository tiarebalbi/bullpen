import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WatchlistRow } from "./WatchlistRow.js";

const row = (over = {}) => <WatchlistRow symbol="MSFT" kind="stock" hue={235} detail="Close · Oct 8" price={410.5} status="◷ Stale · Oct 8" selected={false} onSelect={() => undefined} {...over} />;

describe("WatchlistRow", () => {
  it("a stale row marks its price and its status, so both take the stale tone", () => {
    render(row({ stale: true }));
    expect(screen.getByText("410.50")).toHaveAttribute("data-stale");
    expect(screen.getByText("◷ Stale · Oct 8")).toHaveAttribute("data-stale");
  });

  it("a fresh row marks neither", () => {
    render(row({ status: "▲ +1.25%" }));
    expect(screen.getByText("410.50")).not.toHaveAttribute("data-stale");
    expect(screen.getByText("▲ +1.25%")).not.toHaveAttribute("data-stale");
  });
});
