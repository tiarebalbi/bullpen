import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarriedBadge, CarriedNote, carriedNameSuffix } from "./ArchitectureExplorerCarried.js";
import type { ArchNodeData } from "./ArchitectureExplorer.types.js";

const node = (overrides: Partial<ArchNodeData> = {}): ArchNodeData => ({
  id: "google-analytics",
  label: "Google Analytics 4",
  kind: "ext",
  meta: "Analytics",
  purpose: "Page views.",
  x: 0,
  y: 0,
  ...overrides,
});
const carried = node({ carried: true, builtIn: "part-01" });

describe("the carried card's labels (ADR-0011)", () => {
  it("the panel note says where it was first built and that it is still running in the plan", () => {
    render(<CarriedNote node={carried} />);
    expect(screen.getByText("Built in Part 1; still running in this plan.")).toBeInTheDocument();
    expect(screen.queryByText(/prediction/)).not.toBeInTheDocument();
  });

  it("the badge reads Built in Part 1, from builtIn alone", () => {
    render(<CarriedBadge node={carried} />);
    expect(screen.getByText("Built in Part 1")).toBeInTheDocument();
  });

  it("the accessible name carries where it was built", () => {
    expect(carriedNameSuffix(carried)).toBe(", built in Part 1");
  });

  it("render nothing for a node that is not carried, or has no builtIn", () => {
    const { container } = render(
      <>
        <CarriedNote node={node()} />
        <CarriedBadge node={node()} />
        <CarriedNote node={node({ carried: true })} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(carriedNameSuffix(node())).toBe("");
  });
});
