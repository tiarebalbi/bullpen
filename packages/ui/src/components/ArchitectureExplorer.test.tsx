import { fireEvent, render as baseRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ArchitectureExplorer, type ArchPartData } from "./ArchitectureExplorer.js";

/**
 * The side panel keeps a summary and holds the rest in a bottom sheet (a <dialog>), which jsdom cannot open with showModal(). These tests are
 * about what the sheet says, so it is opened by its attribute, the way the browser leaves it open.
 */
const render = (ui: ReactElement) => {
  const result = baseRender(ui);
  document.querySelectorAll("dialog").forEach((d) => d.setAttribute("open", ""));
  return result;
};

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
    const onPartMoved = vi.fn();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{}} onPartMoved={onPartMoved} />,
    );
    expect(onPartMoved).not.toHaveBeenCalled();

    const scrubber = screen.getByRole("group", { name: "Series part" });
    fireEvent.keyDown(scrubber, { key: "ArrowRight" });
    expect(onPartMoved).toHaveBeenCalledTimes(1);
    expect(onPartMoved).toHaveBeenCalledWith(1, 2);

    fireEvent.keyDown(scrubber, { key: "ArrowLeft" });
    expect(onPartMoved).toHaveBeenLastCalledWith(2, 1);
    expect(onPartMoved).toHaveBeenCalledTimes(2);
  });

  it("shows the default 'what changed' panel with no node selected", () => {
    installMatchMedia();
    render(
      <ArchitectureExplorer parts={[PART_1, PART_2]} adrTitles={{}} adrHrefs={{ "ADR-0003": "#adr-0003" }} />,
    );
    expect(screen.getByText("What changed in Part 1")).toBeInTheDocument();
    expect(screen.getByText(/Part 1 is the starting point/)).toBeInTheDocument();
  });

  describe("the 'what changed' panel of a built part whose nodes were not added or removed", () => {
    const REWORDED_NODES = PART_1.nodes.map((n) => (n.id === "landing-app" ? { ...n, purpose: "The public site, now with an architecture page." } : n));
    const PART_2_BUILT: ArchPartData = {
      ...PART_2,
      status: "built",
      summary: "The same apps, with the rules now failing a build.",
      nodes: REWORDED_NODES,
      changes: [
        { kind: "controls", target: "Bullpen Landing", nodeId: "landing-app", controls: [{ key: "app-boundaries", description: "An app never depends on another app." }, { key: "bare-control" }] },
        { kind: "controls", target: "Reader", nodeId: "reader", controls: [{ key: "reader-rule", description: "Only a reader's rule." }] },
        { kind: "controls", target: "Price Snapshot Service → CoinGecko", controls: [{ key: "call-budget", description: "Calls stay in the allowance." }] },
        { kind: "adr", adr: "ADR-0009" },
      ],
    };
    const adrTitles = { "ADR-0009": "Guardrails enforced, not requested" };
    const adrHrefs = { "ADR-0009": "#adr-0009" };
    const renderPart2 = (part: ArchPartData = PART_2_BUILT) => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, part]} adrTitles={adrTitles} adrHrefs={adrHrefs} />);
      return within(screen.getByLabelText("Details"));
    };

    it("never shows Part 1's starting-point text, and says plainly that no service or connection was added or removed", () => {
      const panel = renderPart2();
      expect(panel.getByText("What changed in Part 2")).toBeInTheDocument();
      expect(panel.queryByText(/starting point/)).not.toBeInTheDocument();
      expect(panel.getByText("No services or connections were added or removed in Part 2. What changed are the rules around them:")).toBeInTheDocument();
    });

    it("lists the panel in order: node changes, the intro line, the control rows, then the ADR row", () => {
      const tool = { id: "tool", label: "Metrics Tool", kind: "service" as const, meta: "Service", purpose: "Counts things.", x: 0, y: 320 };
      const before: ArchPartData = { ...PART_1, nodes: [...PART_1.nodes, tool] };
      const after: ArchPartData = { ...PART_2_BUILT, nodes: [...REWORDED_NODES, { ...tool, purpose: "Counts and reports things." }] };
      installMatchMedia();
      render(<ArchitectureExplorer parts={[before, after]} adrTitles={adrTitles} adrHrefs={adrHrefs} />);
      const text = screen.getByLabelText("Details").textContent ?? "";
      const at = (needle: string) => text.indexOf(needle);

      expect(at("Metrics Tool")).toBeGreaterThan(-1);
      expect(at("Metrics Tool")).toBeLessThan(at("No services or connections"));
      expect(at("No services or connections")).toBeLessThan(at("Bullpen Landing"));
      expect(at("Bullpen Landing")).toBeLessThan(at("ADR-0009"));
    });

    it("shows a changed node once, with the ~ marker and its chips, not a second '+' row", () => {
      const panel = renderPart2();
      expect(panel.getAllByText("Bullpen Landing")).toHaveLength(1);
      expect(panel.getByRole("button", { name: "App boundaries" })).toBeInTheDocument();
      expect(panel.getByRole("button", { name: "Bare control" })).toBeInTheDocument();
      expect(panel.getAllByText("~").length).toBeGreaterThan(0);
    });

    it("gives a node that only gained controls no ~ row", () => {
      const controlsOnly: ArchPartData = { ...PART_2_BUILT, nodes: PART_1.nodes };
      const panel = renderPart2(controlsOnly);
      expect(panel.queryByText("~")).not.toBeInTheDocument();
      expect(panel.getByRole("button", { name: "App boundaries" })).toBeInTheDocument();
    });

    it("shows no description inline: it is in a popover that stays hidden until its chip is pressed", () => {
      const panel = renderPart2();
      expect(panel.getByRole("button", { name: "App boundaries" })).toHaveAttribute("aria-expanded", "false");
      expect(panel.getByText("An app never depends on another app.")).not.toBeVisible();
    });

    it("opens a labelled popover with the model's description and the key, wired by aria-controls", () => {
      const panel = renderPart2();
      const chip = panel.getByRole("button", { name: "App boundaries" });
      fireEvent.click(chip);

      expect(chip).toHaveAttribute("aria-expanded", "true");
      const popover = panel.getByRole("region", { name: "App boundaries" });
      expect(chip.getAttribute("aria-controls")).toBe(popover.id);
      expect(popover).toBeVisible();
      expect(within(popover).getByText("An app never depends on another app.")).toBeVisible();
      expect(within(popover).getByText("app-boundaries")).toBeVisible();
    });

    it("shows only the key in the popover when the model gives no description", () => {
      const panel = renderPart2();
      fireEvent.click(panel.getByRole("button", { name: "Bare control" }));
      const popover = panel.getByRole("region", { name: "Bare control" });
      expect(popover).toBeVisible();
      expect(within(popover).getByText("bare-control")).toBeVisible();
    });

    it("closes on Esc and gives focus back to the chip", () => {
      const panel = renderPart2();
      const chip = panel.getByRole("button", { name: "App boundaries" });
      chip.focus();
      fireEvent.click(chip);
      fireEvent.keyDown(document, { key: "Escape" });

      expect(chip).toHaveAttribute("aria-expanded", "false");
      expect(panel.getAllByRole("region", { hidden: true }).every((popover) => !popover.matches(":not([hidden])"))).toBe(true);
      expect(document.activeElement).toBe(chip);
    });

    it("closes on a pointer press outside, and stays open for a press inside the popover", () => {
      const panel = renderPart2();
      const chip = panel.getByRole("button", { name: "App boundaries" });
      fireEvent.click(chip);

      fireEvent.pointerDown(panel.getByText("An app never depends on another app."));
      expect(chip).toHaveAttribute("aria-expanded", "true");
      fireEvent.pointerDown(document.body);
      expect(chip).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps one popover open at a time: opening a second chip closes the first", () => {
      const panel = renderPart2();
      const first = panel.getByRole("button", { name: "App boundaries" });
      const second = panel.getByRole("button", { name: "Call budget" });
      fireEvent.click(first);
      fireEvent.click(second);

      expect(first).toHaveAttribute("aria-expanded", "false");
      expect(second).toHaveAttribute("aria-expanded", "true");
      expect(panel.getAllByRole("region").filter((el) => el.hidden === false)).toHaveLength(1);
    });

    it("closes the popover when its chip is pressed again", () => {
      const panel = renderPart2();
      const chip = panel.getByRole("button", { name: "App boundaries" });
      fireEvent.click(chip);
      fireEvent.click(chip);
      expect(chip).toHaveAttribute("aria-expanded", "false");
    });

    it("reads an ADR row as 'ADR-0009 — its title' and links it like the other ADR rows", () => {
      const row = renderPart2().getByRole("link", { name: "ADR-0009 — Guardrails enforced, not requested" });
      expect(row).toHaveAttribute("href", "#adr-0009");
    });

    it("says only that nothing was added or removed when the moment added no controls or ADRs", () => {
      const panel = renderPart2({ ...PART_2_BUILT, nodes: PART_1.nodes, changes: undefined });
      expect(panel.getByText("No services or connections were added or removed in Part 2.")).toBeInTheDocument();
      expect(panel.queryByText(/starting point/)).not.toBeInTheDocument();
    });

    it("leaves the intro out when a service was added, since the node diff says it", () => {
      const added: ArchPartData = { ...PART_2_BUILT, nodes: [...PART_1.nodes, { id: "extra", label: "Extra", kind: "service", meta: "New", purpose: "New in Part 2.", x: 0, y: 320 }] };
      const panel = renderPart2(added);
      expect(panel.getByText("Extra")).toBeInTheDocument();
      expect(panel.queryByText(/No services or connections/)).not.toBeInTheDocument();
    });

    it("compares with the part before, not the part the visitor came from: Part 2 reads the same after Part 3, and Part 1 after Part 2", () => {
      installMatchMedia();
      const PART_3: ArchPartData = {
        ...PART_2_BUILT,
        part: 3,
        status: "planned",
        changes: undefined,
        nodes: [...PART_1.nodes.map((n) => ({ ...n, purpose: "Changed in a later part." })), { id: "extra", label: "Extra", kind: "service", meta: "New", purpose: "Only in Part 3.", x: 0, y: 320 }],
      };
      render(<ArchitectureExplorer parts={[PART_1, PART_2_BUILT, PART_3]} initialPart={3} adrTitles={adrTitles} adrHrefs={adrHrefs} />);
      const scrubber = screen.getByRole("group", { name: "Series part" });

      fireEvent.keyDown(scrubber, { key: "ArrowLeft" });
      const panel = within(screen.getByLabelText("Details"));
      expect(panel.getByText("What changed in Part 2")).toBeInTheDocument();
      expect(panel.getByText("No services or connections were added or removed in Part 2. What changed are the rules around them:")).toBeInTheDocument();
      expect(panel.queryByText("Extra")).not.toBeInTheDocument();

      fireEvent.keyDown(scrubber, { key: "ArrowLeft" });
      expect(within(screen.getByLabelText("Details")).getByText(/Part 1 is the starting point/)).toBeInTheDocument();
    });

    it("keeps the starting-point text for Part 1 only", () => {
      installMatchMedia();
      render(<ArchitectureExplorer parts={[PART_1, PART_2_BUILT]} initialPart={1} adrTitles={adrTitles} adrHrefs={adrHrefs} />);

      expect(screen.getByText("What changed in Part 1")).toBeInTheDocument();
      expect(screen.getByText(/Part 1 is the starting point/)).toBeInTheDocument();
    });
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
