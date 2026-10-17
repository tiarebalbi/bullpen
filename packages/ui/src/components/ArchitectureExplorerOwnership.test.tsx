import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ArchitectureExplorer, type ArchNodeData, type ArchPartData } from "./ArchitectureExplorer.js";
import { PartChanges, diffWhatChanged } from "./ArchitectureExplorerChanges.js";

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })),
  });
}

const node = (overrides: Partial<ArchNodeData> & { id: string }): ArchNodeData => ({ label: overrides.id, kind: "service", meta: "m", purpose: "p", x: 0, y: 0, ...overrides });

const BUILT: ArchPartData = {
  part: 3,
  status: "built",
  summary: "One owner per transaction.",
  nodes: [
    node({ id: "player", kind: "actor", label: "Player" }),
    node({ id: "trading-app", kind: "app", label: "Trading App", x: 300 }),
    node({ id: "market-data-service", label: "Market Data Service", x: 600, replaces: ["price-snapshot-service"] }),
    node({ id: "schema-trading", kind: "data", label: "trading", owner: "trading-app", y: 200 }),
    node({ id: "schema-market-data", kind: "data", label: "market_data", owner: "market-data-service", x: 600, y: 200 }),
  ],
  edges: [
    { id: "player-to-trading-app", a: "player", b: "trading-app", type: "sync" },
    { id: "trading-app-to-trading", a: "trading-app", b: "schema-trading", type: "sync", label: "trading_owner · read/write" },
    { id: "market-data-to-market-data", a: "market-data-service", b: "schema-market-data", type: "sync", label: "market_data_owner · write" },
    { id: "trading-app-to-market-data", a: "trading-app", b: "market-data-service", type: "sync" },
  ],
  groups: [],
  request: { name: "a price request", steps: [{ edge: "trading-app-to-market-data", caption: "Ask", detail: "The trading app asks for a price." }] },
  requests: [{ name: "a buy", steps: [{ edge: "player-to-trading-app", caption: "Buy", detail: "The player buys." }, { edge: "trading-app-to-trading", caption: "Record", detail: "One transaction." }] }],
  prediction: { tag: "predictions-week-1", tagUrl: "https://example.test/tag", notBuilt: [{ id: "prices-service", label: "Prices Service" }, { id: "market-history-db", label: "Market History Database" }] },
};
const BEFORE: ArchPartData = {
  part: 2,
  status: "built",
  summary: "Part 2.",
  nodes: [node({ id: "player", kind: "actor", label: "Player" }), node({ id: "trading-app", kind: "app", label: "Trading App", purpose: "older" }), node({ id: "price-snapshot-service", label: "Price Snapshot Service" })],
  edges: [],
  groups: [],
  request: { name: "r", steps: [] },
};

describe("what changed: a node another took over is moved, not removed", () => {
  it("marks the earlier node changed, with where it moved to, and the new one added", () => {
    expect(diffWhatChanged(BEFORE, BUILT).filter((c) => c.id === "price-snapshot-service" || c.id === "market-data-service")).toEqual([
      { id: "market-data-service", label: "Market Data Service", tone: "add" },
      { id: "price-snapshot-service", label: "Price Snapshot Service (moved into Market Data Service)", tone: "change" },
    ]);
  });

  it("still marks a node removed when nothing took it over", () => {
    const gone: ArchPartData = { ...BUILT, nodes: BUILT.nodes.map((n) => ({ ...n, replaces: undefined })) };
    expect(diffWhatChanged(BEFORE, gone).find((c) => c.id === "price-snapshot-service")).toEqual({ id: "price-snapshot-service", label: "Price Snapshot Service", tone: "remove" });
  });
});

describe("what changed: an added node's controls", () => {
  it("shows an added node once, with its rule chips beside it, not as a second row", () => {
    const part: ArchPartData = { ...BUILT, changes: [{ kind: "controls", target: "Market Data Service", nodeId: "market-data-service", controls: [{ key: "call-budget", description: "A call over the cap is refused." }] }] };
    render(<PartChanges part={part} before={BEFORE} adrTitles={{}} adrHrefs={{}} />);

    expect(screen.getAllByText("Market Data Service")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /call.budget/i })).toBeInTheDocument();
    expect(screen.getAllByText("+").length).toBeGreaterThan(0);
  });
});

describe("what changed: the week-one prediction", () => {
  it("lists what the prediction named and the part did not build, and links the tag", () => {
    render(<PartChanges part={BUILT} before={BEFORE} adrTitles={{}} adrHrefs={{}} />);
    const group = screen.getByTestId("prediction-not-built");

    expect(group).toHaveTextContent("Predicted in week one, not built");
    expect(group).toHaveTextContent("Prices Service");
    expect(group).toHaveTextContent("Market History Database");
    expect(screen.getByRole("link", { name: "the prediction, at tag predictions-week-1" })).toHaveAttribute("href", "https://example.test/tag");
  });

  it("shows nothing when the prediction was built as written", () => {
    render(<PartChanges part={{ ...BUILT, prediction: { ...BUILT.prediction!, notBuilt: [] } }} before={BEFORE} adrTitles={{}} adrHrefs={{}} />);
    expect(screen.queryByTestId("prediction-not-built")).not.toBeInTheDocument();
  });
});

describe("ArchitectureExplorer: more than one request, and who owns what", () => {
  beforeAll(() => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error -- test polyfill
    global.ResizeObserver = ResizeObserverStub;
    installMatchMedia();
  });

  it("offers each request to follow and starts the one chosen", () => {
    render(<ArchitectureExplorer parts={[BEFORE, BUILT]} initialPart={3} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    const group = screen.getByRole("radiogroup", { name: "Request to follow" });

    expect(group).toHaveTextContent("a price request");
    expect(group).toHaveTextContent("a buy");
    expect(screen.getByRole("button", { name: /Follow a price request/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "a buy" }));
    expect(screen.getByRole("radio", { name: "a buy" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /Follow a buy/ }));
    expect(screen.getByText(/STEP 1 OF 2/)).toBeInTheDocument();
  });

  it("offers no chooser when a part has only one request", () => {
    render(<ArchitectureExplorer parts={[BEFORE, { ...BUILT, requests: undefined }]} initialPart={3} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    expect(screen.queryByRole("radiogroup", { name: "Request to follow" })).not.toBeInTheDocument();
  });

  it("shows who owns each schema, with a colour per owner, only while Data ownership is on", () => {
    render(<ArchitectureExplorer parts={[BEFORE, BUILT]} initialPart={3} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    expect(screen.queryByTestId("owner-legend")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Data ownership" }));
    const legend = screen.getByTestId("owner-legend");
    expect(legend).toHaveTextContent("Trading App");
    expect(legend).toHaveTextContent("Market Data Service");
    expect(legend).toHaveTextContent("The label on a connection is the database role");
  });
});
