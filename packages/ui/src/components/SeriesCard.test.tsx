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

  describe("the status chip, as the design draws it", () => {
    const styleOf = (label: string) => screen.getByText(label).getAttribute("style") ?? "";

    it("draws Published in lime, Next in the accent and Planned dashed", () => {
      const { rerender } = render(<SeriesCard part={1} title="T" status="published" introduced="X" date="2026-10-04" dateLabel="Oct 4, 2026" href="https://x.test" />);
      expect(styleOf("Published")).toContain("var(--lime-glow)");
      expect(styleOf("Published")).toContain("var(--lime-glow-foreground)");

      rerender(<SeriesCard part={2} title="T" status="next" introduced="X" />);
      expect(styleOf("Next")).toContain("var(--ember)");

      rerender(<SeriesCard part={3} title="T" status="planned" introduced="X" />);
      expect(styleOf("Planned")).toContain("dashed");
    });
  });

  it("links 'See it →' to the post for a published part, and shows 'Next' with no link and no date for the next one", () => {
    const { rerender } = render(<SeriesCard part={1} title="T" status="published" introduced="X" date="2026-10-04" dateLabel="Oct 4, 2026" href="https://tiarebalbi.com/en/blog/a-post" />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it →" })).toHaveAttribute("href", "https://tiarebalbi.com/en/blog/a-post");

    rerender(<SeriesCard part={2} title="T" status="next" introduced="X" />);
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Not yet published")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
