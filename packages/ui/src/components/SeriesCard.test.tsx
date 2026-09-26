import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeriesCard } from "./SeriesCard.js";

describe("SeriesCard", () => {
  it("renders part, title, status and introduced text", () => {
    render(
      <SeriesCard
        part={1}
        title="Why distribute at all"
        status="next"
        introduced="Monorepo skeleton, architecture-as-code, and BTC-USD live via CoinGecko."
      />,
    );
    expect(screen.getByText("Part 1")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Why distribute at all")).toBeInTheDocument();
    expect(screen.getByText(/Monorepo skeleton/)).toBeInTheDocument();
  });

  it("shows 'Not yet published' and no link when there's no date/href", () => {
    render(<SeriesCard part={2} title="Architecture as code" status="planned" introduced="X" />);
    expect(screen.getByText("Not yet published")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the real date and a 'See it →' link when published", () => {
    render(
      <SeriesCard
        part={1}
        title="Why distribute at all"
        status="published"
        introduced="X"
        date="2026-10-04"
        dateLabel="Oct 4, 2026"
        href="https://tiarebalbi.com/part-1"
      />,
    );
    expect(screen.queryByText("Not yet published")).not.toBeInTheDocument();
    expect(screen.getByText("Oct 4, 2026")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "See it →" });
    expect(link).toHaveAttribute("href", "https://tiarebalbi.com/part-1");
  });
});
