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

  it("shows the link but no date, and not 'Not yet published', for a published part whose date is not written in yet", () => {
    render(<SeriesCard part={3} title="Who owns the data" status="published" introduced="X" date={null} href="https://tiarebalbi.com/part-3" />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.queryByText("Not yet published")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it →" })).toHaveAttribute("href", "https://tiarebalbi.com/part-3");
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

describe("SeriesCard: the bonus", () => {
  const styleOf = (element: HTMLElement) => element.getAttribute("style") ?? "";
  const card = (container: HTMLElement) => container.querySelector(".bp-series-card") as HTMLElement;

  it("has a diamond and 'Bonus · Detour' where a part has its number, and no part number", () => {
    const { container } = render(<SeriesCard bonus title="Changing the plan mid-flight" status="next" introduced="X" plannedLabel="Planned · Nov 9" plannedDate="2026-11-09" />);
    expect(screen.getByText("Bonus · Detour")).toBeInTheDocument();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByText(/^Part \d/)).not.toBeInTheDocument();
    expect(card(container)).toHaveAttribute("data-kind", "bonus");
  });

  it("draws the accent as a dashed border, with more weight than a part's card and the same box", () => {
    const { container, rerender } = render(<SeriesCard bonus title="T" status="next" introduced="X" />);
    const bonus = styleOf(card(container));
    expect(bonus).toContain("dashed");
    expect(bonus).toContain("var(--ember)");
    expect(bonus).toContain("min-height: 280px");
    rerender(<SeriesCard part={4} title="T" status="published" introduced="X" />);
    const part = styleOf(card(container));
    expect(part).not.toContain("dashed");
    expect(part).toContain("min-height: 280px");
    expect(card(container)).toHaveAttribute("data-kind", "part");
  });

  it("next: the Next chip, a planned date that says Planned, no link and no 'Not yet published'", () => {
    render(<SeriesCard bonus title="T" status="next" introduced="X" plannedLabel="Planned · Nov 9" plannedDate="2026-11-09" />);
    expect(screen.getByText("Next")).toBeInTheDocument();
    const planned = screen.getByText("Planned · Nov 9");
    expect(planned.tagName).toBe("TIME");
    expect(planned).toHaveAttribute("datetime", "2026-11-09");
    expect(screen.queryByText("Not yet published")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("published: the real date and the link, and no planned date even if one is passed", () => {
    render(<SeriesCard bonus title="T" status="published" introduced="X" date="2026-11-09" dateLabel="Nov 9, 2026" href="https://tiarebalbi.com/en/blog/the-bonus" plannedLabel="Planned · Nov 9" plannedDate="2026-11-09" />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Nov 9, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Planned · /)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it →" })).toHaveAttribute("href", "https://tiarebalbi.com/en/blog/the-bonus");
  });

  it("planned: the Planned chip and a date that is set apart from a published one", () => {
    render(<SeriesCard bonus title="T" status="planned" introduced="X" plannedLabel="Planned · Nov 9" plannedDate="2026-11-09" />);
    expect(screen.getAllByText("Planned")).toHaveLength(1);
    const planned = screen.getByText("Planned · Nov 9");
    expect(styleOf(planned)).toContain("dashed");
    expect(styleOf(planned)).toContain("italic");
  });
});

describe("SeriesCard: a planned date on a numbered part", () => {
  it("shows the date alone, set apart, with 'Planned for' for a screen reader", () => {
    render(<SeriesCard part={5} title="T" status="planned" introduced="X" plannedLabel="Nov 16" plannedDate="2026-11-16" />);
    const time = screen.getByText("Nov 16", { exact: false });
    expect(time.closest("time")).toHaveAttribute("datetime", "2026-11-16");
    expect(time.closest("time")!.textContent).toBe("Planned for Nov 16");
    expect(screen.queryByText("Not yet published")).not.toBeInTheDocument();
    expect(styleOf2(time.closest("time")!)).toContain("dashed");
    // the hidden text is placed against the date, which is positioned, so it cannot widen a scrolling rail
    expect(styleOf2(time.closest("time")!)).toContain("position: relative");
  });

  it("never shows a planned date as a published one: a part with a real date shows only that", () => {
    render(<SeriesCard part={1} title="T" status="published" introduced="X" date="2026-10-04" dateLabel="Oct 4, 2026" plannedLabel="Nov 16" plannedDate="2026-11-16" href="https://x.test" />);
    expect(screen.getByText("Oct 4, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Nov 16/)).not.toBeInTheDocument();
  });
});

const styleOf2 = (element: Element): string => element.getAttribute("style") ?? "";
