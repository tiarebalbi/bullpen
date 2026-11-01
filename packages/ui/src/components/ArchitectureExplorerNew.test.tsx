import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ReactFlowProvider, type NodeProps, type EdgeProps } from "@xyflow/react";
import { ArchitectureExplorer, type ArchPartData } from "./ArchitectureExplorer.js";
import { ArchitectureExplorerEdge } from "./ArchitectureExplorerEdge.js";
import { flowEdgesOf } from "./ArchitectureExplorerFlowEdges.js";
import { ArchitectureExplorerNode, type ArchFlowNodeData } from "./ArchitectureExplorerNode.js";
import { newInPart } from "../lib/newInPart.js";

function installMatchMedia(reduce = false): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({ matches: reduce && /reduce/.test(query), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })),
  });
}

const base = { summary: "s", groups: [] as ArchPartData["groups"], request: { name: "r", steps: [{ edge: "a-b", caption: "c", detail: "d" }] } };
const node = (id: string, x: number, kind: "app" | "ext" = "app") => ({ id, label: id.toUpperCase(), kind, meta: "m", purpose: "p", x, y: 0 });
const ONE: ArchPartData = { ...base, part: 1, status: "built", nodes: [node("a", 0), node("b", 200)], edges: [{ id: "a-b", a: "a", b: "b", type: "sync" }] };
const TWO: ArchPartData = { ...base, part: 2, status: "built", nodes: [node("a", 0), node("b", 200), node("c", 400, "ext")], edges: [{ id: "a-b", a: "a", b: "b", type: "sync" }, { id: "b-c", a: "b", b: "c", type: "sync" }] };
const THREE: ArchPartData = { ...TWO, part: 3, status: "planned", nodes: [...TWO.nodes, node("d", 600)], edges: [...TWO.edges, { id: "c-d", a: "c", b: "d", type: "sync" }] };

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error -- test polyfill
  global.ResizeObserver = ResizeObserverStub;
});


const flowNode = (over: Partial<ArchFlowNodeData> = {}): ArchFlowNodeData => ({ node: node("c", 0, "ext"), visualState: "same", ghosted: false, isNew: false, reduced: false, dimmed: false, touched: false, showData: false, onSelect: () => undefined, ...over });
const renderNode = (data: ArchFlowNodeData) =>
  render(
    <ReactFlowProvider>
      <ArchitectureExplorerNode {...({ data, selected: false } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  );
const renderEdge = (data: Record<string, unknown>) =>
  render(
    <ReactFlowProvider>
      <svg>
        <ArchitectureExplorerEdge {...({ id: "e", sourceX: 0, sourceY: 0, targetX: 100, targetY: 100, sourcePosition: "bottom", targetPosition: "top", data } as unknown as EdgeProps)} />
      </svg>
    </ReactFlowProvider>,
  );
const nodeBox = (container: HTMLElement) => container.querySelector('[role="button"] > div:not([class*="react-flow__handle"])') as HTMLElement;

describe("a node the moment adds", () => {
  it("has the accent as its border, a NEW label and 'new in this part' in its name", () => {
    installMatchMedia();
    const { container } = renderNode(flowNode({ isNew: true }));
    const button = container.querySelector('[role="button"]')!;
    expect(button).toHaveAttribute("data-new", "true");
    expect(button.getAttribute("aria-label")).toBe("C, External, new in this part");
    expect(nodeBox(container).getAttribute("style")).toContain("1.5px solid var(--ember)");
    expect(within(button as HTMLElement).getByText("NEW")).toBeInTheDocument();
  });

  it("is not marked, and not renamed, when it is not new", () => {
    installMatchMedia();
    const { container } = renderNode(flowNode());
    const button = container.querySelector('[role="button"]')!;
    expect(button).not.toHaveAttribute("data-new");
    expect(button.getAttribute("aria-label")).toBe("C, External");
    expect(nodeBox(container).getAttribute("style")).not.toContain("var(--ember)");
    expect(within(button as HTMLElement).queryByText("NEW")).toBeNull();
  });

  it("keeps its dashed planned outline when it is also new, in the accent and at full strength, with the PLANNED label", () => {
    installMatchMedia();
    const { container } = renderNode(flowNode({ isNew: true, ghosted: true }));
    const style = nodeBox(container).getAttribute("style")!;
    expect(style).toContain("1.5px dashed var(--ember)");
    expect(style).toContain("opacity: 1");
    expect(style).not.toContain("opacity: 0.55");
    expect(within(container).getByText("PLANNED")).toBeInTheDocument();
    expect(within(container).getByText("NEW")).toBeInTheDocument();
  });

  it("is still ghosted when it is planned and not new", () => {
    installMatchMedia();
    const { container } = renderNode(flowNode({ ghosted: true }));
    const style = nodeBox(container).getAttribute("style")!;
    expect(style).toContain("opacity: 0.55");
    expect(style).toContain("1px dashed var(--foreground-muted)");
  });

  it("glows with a slow pulse by default, and holds the glow still when motion is reduced", () => {
    installMatchMedia();
    const live = renderNode(flowNode({ isNew: true }));
    expect(nodeBox(live.container).className).toBe("bp-arch-node--new");
    live.unmount();
    const still = renderNode(flowNode({ isNew: true, reduced: true }));
    expect(nodeBox(still.container).className).toBe("bp-arch-node--new bp-arch-node--new-static");
  });

  it("is dimmed like any node while another is selected", () => {
    installMatchMedia();
    const { container } = renderNode(flowNode({ isNew: true, dimmed: true }));
    expect(nodeBox(container).getAttribute("style")).toContain("opacity: 0.38");
  });
});

describe("a line the moment adds", () => {
  const edgeInput = (newEdgeIds: Set<string>) => ({ edges: TWO.edges, current: TWO, builtEdgeIds: new Set<string>(), newEdgeIds, nodesById: new Map(TWO.nodes.map((n) => [n.id, n])), activeStep: undefined, requestOn: false, showData: false, showType: true, reduced: false, paused: false, ownerHues: new Map<string, number>() });

  it("is flagged for the lines in the new set and no other", () => {
    const edges = flowEdgesOf(edgeInput(newInPart(ONE, TWO).edges as Set<string>));
    expect(edges.map((e) => [e.id, (e.data as { isNew: boolean }).isNew])).toEqual([["a-b", false], ["b-c", true]]);
  });

  it("is drawn in the accent, thicker and glowing, and the others are not", () => {
    const base = { type: "sync", ghosted: false, onPath: false, dimmed: false, showType: true, reduced: false };
    const added = renderEdge({ ...base, isNew: true }).container.querySelector("path.react-flow__edge-path")!;
    expect(added).toHaveAttribute("data-new", "true");
    expect(added.getAttribute("style")).toContain("stroke: var(--ember)");
    expect(added.getAttribute("style")).toContain("stroke-width: 2");
    expect(added.getAttribute("class")).toContain("bp-arch-edge--new");
    expect(added.getAttribute("class")).not.toContain("bp-arch-edge--new-static");
    const plain = renderEdge({ ...base, isNew: false }).container.querySelectorAll("path.react-flow__edge-path");
    expect(plain[plain.length - 1]!.getAttribute("style")).not.toContain("stroke: var(--ember)");
  });

  it("holds the glow still when motion is reduced, and is not ghosted when it is planned and new", () => {
    const base = { type: "sync", ghosted: true, onPath: false, dimmed: false, showType: true };
    const still = renderEdge({ ...base, isNew: true, reduced: true }).container.querySelector("path.react-flow__edge-path")!;
    expect(still.getAttribute("class")).toContain("bp-arch-edge--new-static");
    expect(still.getAttribute("style")).toContain("opacity: 1");
  });
});

describe("the legend", () => {
  it("says 'New in this part' beside the others when the moment adds something", () => {
    installMatchMedia();
    render(<ArchitectureExplorer parts={[ONE, TWO]} part={2} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    const legend = screen.getByTestId("legend-new").parentElement!;
    expect(within(legend).getByText("New in this part")).toBeInTheDocument();
    for (const entry of ["Synchronous", "Asynchronous", "External"]) expect(within(legend).getByText(entry)).toBeInTheDocument();
  });

  it("has no such entry in the first part, which adds nothing", () => {
    installMatchMedia();
    render(<ArchitectureExplorer parts={[ONE, TWO]} part={1} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    expect(screen.queryByText("New in this part")).toBeNull();
  });

  it("keeps the Planned entry for a planned part, next to the new one", () => {
    installMatchMedia();
    render(<ArchitectureExplorer parts={[TWO, THREE]} part={3} hideScrubber adrTitles={{}} adrHrefs={{}} />);
    const legend = screen.getByTestId("legend-new").parentElement!;
    expect(within(legend).getByText("Planned, ghosted")).toBeInTheDocument();
    expect(within(legend).getByText("New in this part")).toBeInTheDocument();
  });
});
