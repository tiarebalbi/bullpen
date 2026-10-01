import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ArchitectureExplorer, type ArchPartData } from "./ArchitectureExplorer.js";

function installMatchMedia(matches = false): void {
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

const PART_1: ArchPartData = {
  part: 1,
  status: "built",
  summary: "Two apps and one service, calling CoinGecko.",
  nodes: [
    { id: "reader", label: "Reader", kind: "actor", meta: "Visitor", purpose: "Browses the site.", x: 0, y: 0 },
    { id: "landing-app", label: "Bullpen Landing", kind: "app", meta: "Static", purpose: "The public site.", x: 0, y: 160, adrs: ["ADR-0003"] },
  ],
  edges: [{ id: "reader-to-landing", a: "reader", b: "landing-app", type: "sync" }],
  groups: [],
  request: {
    name: "a request",
    steps: [{ edge: "reader-to-landing", caption: "Browse", detail: "Reader opens the site." }],
  },
};

const PART_2: ArchPartData = {
  ...PART_1,
  part: 2,
  status: "planned",
  summary: "Prediction: an architecture explorer, no new runtime nodes.",
};

describe("ArchitectureExplorer", () => {
  beforeAll(() => {
    // React Flow measures its container via ResizeObserver, which jsdom
    // doesn't implement.
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error -- test polyfill
    global.ResizeObserver = ResizeObserverStub;
  });

  it("renders the current part's summary, status chip and toggles", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{ "ADR-0003": "Monorepo" }} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );

    expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 1")).toBeInTheDocument();
    expect(screen.getAllByText("Built").length).toBeGreaterThan(0);
    expect(screen.getByText("Two apps and one service, calling CoinGecko.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Group by quanta" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Sync vs async" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Data ownership" })).toBeInTheDocument();
  });

  it("moves to the next part on the scrubber's arrow-right key and updates the summary", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );

    const scrubber = screen.getByRole("group", { name: "Series part" });
    fireEvent.keyDown(scrubber, { key: "ArrowRight" });

    expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 2")).toBeInTheDocument();
    expect(screen.getByText("Prediction: an architecture explorer, no new runtime nodes.")).toBeInTheDocument();
  });

  it("shows the default 'what changed' panel with no node selected", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );
    expect(screen.getByText("What changed in Part 1")).toBeInTheDocument();
    expect(screen.getByText(/Part 1 is the starting point/)).toBeInTheDocument();
  });

  it("shows the 'Follow' button for the part's real request name", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );
    expect(screen.getByRole("button", { name: "▶ Follow a request" })).toBeInTheDocument();
  });

  it("flips a toggle's aria-checked state on click", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );
    const dataToggle = screen.getByRole("switch", { name: "Data ownership" });
    expect(dataToggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(dataToggle);
    expect(dataToggle).toHaveAttribute("aria-checked", "true");
  });

  describe("controlled part", () => {
    const PART_3: ArchPartData = { ...PART_1, part: 3, status: "planned", summary: "Prediction: the first split." };
    const parts = [PART_1, PART_2, PART_3];

    it("shows the part it is given, not its own initial part", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={parts} part={2} adrTitles={{}} adrHrefs={{}} />);
      expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 2")).toBeInTheDocument();
    });

    it("asks the parent for the next part instead of moving on its own", () => {
      installMatchMedia();
      const onPartChange = vi.fn();
      render(<ArchitectureExplorer parts={parts} part={2} onPartChange={onPartChange} adrTitles={{}} adrHrefs={{}} />);

      fireEvent.keyDown(screen.getByRole("group", { name: "Series part" }), { key: "ArrowRight" });

      expect(onPartChange).toHaveBeenCalledWith(3);
      expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 2")).toBeInTheDocument();
    });

    it("follows the parent when the part prop changes", () => {
      installMatchMedia();
      const { rerender } = render(<ArchitectureExplorer parts={parts} part={1} onPartChange={() => {}} adrTitles={{}} adrHrefs={{}} />);
      expect(screen.getByText("Two apps and one service, calling CoinGecko.")).toBeInTheDocument();

      rerender(<ArchitectureExplorer parts={parts} part={3} onPartChange={() => {}} adrTitles={{}} adrHrefs={{}} />);

      expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 3")).toBeInTheDocument();
      expect(screen.getByText("Prediction: the first split.")).toBeInTheDocument();
    });

    it("leaves the uncontrolled explorer exactly as it was: it moves on its own when no part is given", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={parts} adrTitles={{}} adrHrefs={{}} />);
      fireEvent.keyDown(screen.getByRole("group", { name: "Series part" }), { key: "ArrowRight" });
      expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 2")).toBeInTheDocument();
    });
  });

  describe("which part it opens on", () => {
    const BUILT_2: ArchPartData = { ...PART_2, status: "built", summary: "Built: the guardrails." };
    const PLANNED_3: ArchPartData = { ...PART_1, part: 3, status: "planned", summary: "Prediction: the first split." };
    const overview = (part: number) => screen.getByText((_, el) => el?.textContent === `Overview · Part ${part}`);

    it("opens on the latest built part, whatever its number", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, BUILT_2, PLANNED_3]} adrTitles={{}} adrHrefs={{}} />);
      expect(overview(2)).toBeInTheDocument();
      expect(screen.getByText("Built: the guardrails.")).toBeInTheDocument();
    });

    it("opens on Part 1 when only Part 1 is built", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, PART_2, PLANNED_3]} adrTitles={{}} adrHrefs={{}} />);
      expect(overview(1)).toBeInTheDocument();
    });

    it("lets an explicit initialPart win over the default", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, BUILT_2, PLANNED_3]} initialPart={1} adrTitles={{}} adrHrefs={{}} />);
      expect(overview(1)).toBeInTheDocument();
    });

    it("lets a controlled part win over the default", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, BUILT_2, PLANNED_3]} part={3} onPartChange={() => {}} adrTitles={{}} adrHrefs={{}} />);
      expect(overview(3)).toBeInTheDocument();
    });

    it("keeps a part the reader scrubbed to instead of snapping back to the default", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, BUILT_2, PLANNED_3]} adrTitles={{}} adrHrefs={{}} />);
      fireEvent.keyDown(screen.getByRole("group", { name: "Series part" }), { key: "ArrowLeft" });
      expect(overview(1)).toBeInTheDocument();
    });
  });

  it("hides its own scrubber when the page provides one", () => {
    installMatchMedia();
    render(<ArchitectureExplorer parts={[PART_1, PART_2]} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    expect(screen.queryByRole("group", { name: "Series part" })).not.toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "Overview · Part 1")).toBeInTheDocument();
  });

  // Node selection itself (clicking a React Flow node, opening the side
  // panel with its real purpose/ADR link) isn't exercised here: React
  // Flow measures its canvas via ResizeObserver and ties node mounting to
  // that measurement, which jsdom can't provide a real value for even
  // with a stub. That interaction is covered for real in
  // apps/landing/e2e/architecture.spec.ts, which runs against an actual
  // browser where layout/measurement work.
});
