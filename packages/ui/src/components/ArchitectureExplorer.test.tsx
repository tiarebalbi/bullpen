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

  it("reports each move between parts once, as from and to", () => {
    installMatchMedia();
    const onPartChange = vi.fn();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{}} onPartChange={onPartChange} />,
    );
    expect(onPartChange).not.toHaveBeenCalled();

    const scrubber = screen.getByRole("group", { name: "Series part" });
    fireEvent.keyDown(scrubber, { key: "ArrowRight" });
    expect(onPartChange).toHaveBeenCalledTimes(1);
    expect(onPartChange).toHaveBeenCalledWith(1, 2);

    fireEvent.keyDown(scrubber, { key: "ArrowLeft" });
    expect(onPartChange).toHaveBeenLastCalledWith(2, 1);
    expect(onPartChange).toHaveBeenCalledTimes(2);
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

  // Node selection itself (clicking a React Flow node, opening the side
  // panel with its real purpose/ADR link) isn't exercised here: React
  // Flow measures its canvas via ResizeObserver and ties node mounting to
  // that measurement, which jsdom can't provide a real value for even
  // with a stub. That interaction is covered for real in
  // apps/landing/e2e/architecture.spec.ts, which runs against an actual
  // browser where layout/measurement work.
});
