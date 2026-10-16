import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArchEdgeData, ArchEdgeRate, ArchPartData } from "./ArchitectureExplorer.types.js";
import { EdgePanel } from "./ArchitectureExplorerEdgePanel.js";
import { RATE_GROUPS, DetailsSheet, groupByRateSource } from "./ArchitectureExplorerTrafficSheet.js";

const rate = (over: Partial<ArchEdgeRate> = {}): ArchEdgeRate => ({ count: 6, per: "minute", source: "illustrative", basis: "No production traffic yet.", ...over });
const edge = (id: string, over: Partial<ArchEdgeRate> | null, a = "a", b = "b"): ArchEdgeData => ({ id, a, b, type: "sync", ...(over === null ? {} : { rate: rate(over) }) });
const part = (edges: ArchEdgeData[]): ArchPartData => ({
  part: 3, status: "built", summary: "s",
  nodes: [{ id: "a", label: "Alpha", kind: "app", meta: "m", purpose: "p", x: 0, y: 0 }, { id: "b", label: "Beta", kind: "service", meta: "m", purpose: "p", x: 1, y: 1 }],
  edges, groups: [], request: { name: "r", steps: [] },
});

describe("groupByRateSource", () => {
  const edges = [edge("i1", { source: "illustrative" }), edge("m1", { source: "measured" }), edge("c1", { source: "configured" }), edge("i2", { source: "illustrative" }), edge("none", null)];

  it("orders the groups measured, configured, illustrative, and keeps each connection in the part's order", () => {
    const groups = groupByRateSource(part(edges));
    expect(groups.map((g) => g.source)).toEqual(["measured", "configured", "illustrative"]);
    expect(groups.map((g) => g.edges.map((e) => e.id))).toEqual([["m1"], ["c1"], ["i1", "i2"]]);
  });

  it("leaves out a group with no connections and a connection with no rate", () => {
    const groups = groupByRateSource(part([edge("c1", { source: "configured" }), edge("none", null)]));
    expect(groups.map((g) => g.source)).toEqual(["configured"]);
    expect(groups.flatMap((g) => g.edges.map((e) => e.id))).toEqual(["c1"]);
  });

  it("names the three labels and what each means", () => {
    expect(RATE_GROUPS.map((g) => g.title)).toEqual(["Measured", "Configured", "Illustrative"]);
    expect(RATE_GROUPS[0]!.meaning).toMatch(/load test, not from users/);
    expect(RATE_GROUPS[1]!.meaning).toMatch(/schedule or a cap in the repo/);
    expect(RATE_GROUPS[2]!.meaning).toMatch(/not how much/);
  });
});

describe("DetailsSheet", () => {
  const before: ArchPartData = { ...part([]), part: 2, nodes: [part([]).nodes[0]!] };
  const sheet = (edges: ArchEdgeData[]) => render(<DetailsSheet part={part(edges)} before={before} adrTitles={{}} adrHrefs={{}} />);

  it("keeps the panel to a summary: what was added, changed and removed, and how many lines have a rate", () => {
    sheet([edge("m1", { source: "measured" }), edge("i1", {}), edge("none", null)]);
    const glance = screen.getByRole("list", { name: "Part 3 at a glance" });
    expect(glance).toHaveTextContent("1 added"); // Beta is new in Part 3
    expect(glance).toHaveTextContent("0 changed");
    expect(glance).toHaveTextContent("0 removed");
    expect(glance).toHaveTextContent("2 lines with a rate");
  });

  it("has the two buttons that open the rest, and the sheet closed until one is pressed", () => {
    const { container } = sheet([edge("m1", { source: "measured" })]);
    expect(screen.getByRole("button", { name: "What changed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Traffic details" })).toBeInTheDocument();
    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("puts what changed first in the sheet, with a Traffic section a button away", () => {
    const { container } = sheet([edge("m1", { source: "measured", count: 14, per: "second", basis: "Load test." })]);
    const nav = screen.getByRole("group", { name: "Sections", hidden: true });
    expect(nav).toHaveTextContent("What changed");
    expect(nav).toHaveTextContent("Traffic");
    // the sheet opens on What changed: the traffic rows are not drawn until its section is chosen
    expect(container.querySelector("li[data-edge]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Traffic", hidden: true }));
    const rows = [...container.querySelectorAll("li[data-edge]")];
    expect(rows.map((r) => r.getAttribute("data-edge"))).toEqual(["m1"]);
    expect(rows[0]).toHaveTextContent("Alpha → Beta");
    expect(rows[0]).toHaveTextContent("14 a second");
    expect(rows[0]).toHaveTextContent("Load test.");
  });

  it("expands a row's whole basis on a tap and hides it again on the next, and keeps the full text as the tooltip", () => {
    const { container } = sheet([edge("m1", { source: "measured", basis: "A long basis that runs past two lines on a phone and is cut there." })]);
    fireEvent.click(screen.getByRole("button", { name: "Traffic", hidden: true }));
    const row = container.querySelector("li[data-edge=m1]")!;
    const button = row.querySelector("button")!;
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("title", "A long basis that runs past two lines on a phone and is cut there.");
    expect(row).not.toHaveAttribute("data-open");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveAttribute("data-open");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(row).not.toHaveAttribute("data-open");
  });

  it("explains the three labels in the traffic intro", () => {
    const { container } = sheet([edge("i1", {})]);
    fireEvent.click(screen.getByRole("button", { name: "Traffic", hidden: true }));
    const intro = container.querySelector(".bp-traffic-sheet__intro")!;
    for (const word of ["Measured", "Configured", "Illustrative"]) expect(intro).toHaveTextContent(word);
  });

  it("has no Traffic button or section for a part with no rated line", () => {
    sheet([edge("none", null)]);
    expect(screen.queryByRole("button", { name: "Traffic details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Traffic", hidden: true })).not.toBeInTheDocument();
  });
});

describe("EdgePanel", () => {
  it("says what the line joins, how it is called, and its rate with where it comes from", () => {
    render(<EdgePanel part={part([])} edge={{ ...edge("e", { source: "configured", count: 1, per: "day", basis: "The cron runs once a day." }), caption: "/api/price (rewrite)", type: "async" }} onClose={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Alpha → Beta" })).toBeInTheDocument();
    expect(screen.getByText(/asynchronous/)).toBeInTheDocument();
    expect(screen.getByText("/api/price (rewrite)")).toBeInTheDocument();
    expect(screen.getByText("1 a day, configured. The cron runs once a day.")).toBeInTheDocument();
  });

  it("marks an illustrative rate as illustrative, and closes", () => {
    let closed = false;
    render(<EdgePanel part={part([])} edge={edge("e", {})} onClose={() => (closed = true)} />);
    expect(screen.getByText(/^Illustrative, 6 a minute\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(closed).toBe(true);
  });

  it("says so when a connection has no rate", () => {
    render(<EdgePanel part={part([])} edge={edge("e", null)} onClose={() => undefined} />);
    expect(screen.getByText("No rate is recorded for this connection.")).toBeInTheDocument();
  });
});
