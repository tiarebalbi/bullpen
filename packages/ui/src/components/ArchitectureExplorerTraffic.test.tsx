import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArchEdgeData, ArchEdgeRate, ArchPartData } from "./ArchitectureExplorer.types.js";
import { EdgePulses, TRAVEL_SECONDS, TrafficControl, TrafficPanel, busyness, carriesTraffic, perMinute, pulseTiming, rateShort, rateText, rateWords } from "./ArchitectureExplorerTraffic.js";

const rate = (over: Partial<ArchEdgeRate> = {}): ArchEdgeRate => ({ count: 6, per: "minute", source: "illustrative", basis: "No production traffic yet.", ...over });

describe("rates", () => {
  it("turns a count per a unit of time into events a minute", () => {
    expect(perMinute(rate({ count: 14, per: "second" }))).toBe(840);
    expect(perMinute(rate({ count: 12, per: "hour" }))).toBeCloseTo(0.2);
    expect(perMinute(rate({ count: 1, per: "day" }))).toBeCloseTo(1 / 1440);
  });

  it("says a rate in words, with where it comes from, and an illustrative one says so first", () => {
    expect(rateWords(rate({ count: 14, per: "second" }))).toBe("14 a second");
    expect(rateWords(rate({ count: 12, per: "hour" }))).toBe("12 an hour");
    expect(rateText(rate({ count: 14, per: "second", source: "measured", basis: "Load test." }))).toBe("14 a second, measured. Load test.");
    expect(rateText(rate())).toBe("Illustrative, 6 a minute. No production traffic yet.");
  });

  it("writes a short form for a line that is not moving", () => {
    expect(rateShort(rate({ count: 14, per: "second" }))).toBe("14/s");
    expect(rateShort(rate({ count: 12, per: "hour" }))).toBe("12/hour");
    expect(rateShort(rate({ count: 1, per: "day" }))).toBe("1/day");
  });
});

describe("pulse density", () => {
  const timings = [{ count: 1, per: "day" as const }, { count: 12, per: "hour" as const }, { count: 6, per: "minute" as const }, { count: 14, per: "second" as const }].map((r) => pulseTiming(rate(r)));

  it("puts more pulses on a busier line, one on a quiet line and six on the busiest, never fewer for a higher rate", () => {
    const counts = timings.map((t) => t.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
    expect(counts[0]).toBe(1);
    expect(counts.at(-1)).toBe(6);
    expect(pulseTiming(rate({ count: 100000, per: "second" })).count).toBe(6);
    expect(pulseTiming(rate({ count: 1, per: "day" })).count).toBe(1);
  });

  it("spaces a busy line's pulses evenly along its crossing, and gives a quiet line a long wait between its pulses", () => {
    const busy = timings.at(-1)!;
    expect(busy.period).toBe(TRAVEL_SECONDS);
    expect(busy.gap * busy.count).toBeCloseTo(TRAVEL_SECONDS, 5);
    expect(timings[0]!.period).toBeGreaterThan(TRAVEL_SECONDS);
  });

  it("is on a log scale between 0 and 1", () => {
    expect(busyness(rate({ count: 1, per: "day" }))).toBe(0);
    expect(busyness(rate({ count: 100000, per: "second" }))).toBe(1);
    const mid = busyness(rate({ count: 6, per: "minute" }));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.7);
  });
});

describe("EdgePulses", () => {
  const draw = (still: boolean) =>
    render(
      <svg>
        <EdgePulses path="M0,0 L100,0" rate={rate({ count: 14, per: "second", source: "measured" })} look={{ color: "var(--ember)", still, onPath: false }} edgeId="e1" />
      </svg>,
    );

  it("draws one circle for each pulse, moving along the path, and says its source", () => {
    const { container } = draw(false);
    const group = screen.getByTestId("edge-pulses");
    expect(group).toHaveAttribute("data-source", "measured");
    expect(container.querySelectorAll("circle.bp-arch-pulse")).toHaveLength(Number(group.getAttribute("data-pulses")));
    expect(container.querySelector("animateMotion")).toHaveAttribute("path", "M0,0 L100,0");
  });

  it("draws nothing when the line is still: reduced motion, paused, or not the line being followed", () => {
    const { container } = draw(true);
    expect(container.querySelector("[data-testid=edge-pulses]")).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
  });
});

describe("carriesTraffic", () => {
  const edge = (r?: ArchEdgeRate): ArchEdgeData => ({ id: "e", a: "a", b: "b", type: "sync", rate: r });
  it("is true for a built line with a rate, and false for a planned one or one with no rate", () => {
    expect(carriesTraffic(edge(rate()), false)).toBe(true);
    expect(carriesTraffic(edge(rate()), true)).toBe(false);
    expect(carriesTraffic(edge(), false)).toBe(false);
  });
});

describe("TrafficControl", () => {
  const rated: ArchEdgeData[] = [{ id: "e", a: "a", b: "b", type: "sync", rate: rate() }];

  it("is not there for a part whose connections have no rates", () => {
    const { container } = render(<TrafficControl edges={[{ id: "e", a: "a", b: "b", type: "sync" }]} paused={false} reduced={false} onToggle={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("pauses and plays, and says which it will do", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TrafficControl edges={rated} paused={false} reduced={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /Pause traffic/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<TrafficControl edges={rated} paused reduced={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: /Play traffic/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("is switched off for good under reduced motion, and says why instead of offering to play", () => {
    const onToggle = vi.fn();
    render(<TrafficControl edges={rated} paused={false} reduced onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Traffic is off: reduced motion" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("TrafficPanel", () => {
  const part = (edges: ArchEdgeData[]): ArchPartData => ({
    part: 3, status: "built", summary: "s",
    nodes: [{ id: "a", label: "Alpha", kind: "app", meta: "m", purpose: "p", x: 0, y: 0 }, { id: "b", label: "Beta", kind: "service", meta: "m", purpose: "p", x: 1, y: 1 }],
    edges, groups: [], request: { name: "r", steps: [] },
  });

  it("lists each rated connection with its rate, and marks an illustrative one as illustrative", () => {
    render(<TrafficPanel part={part([{ id: "e1", a: "a", b: "b", type: "sync", rate: rate() }, { id: "e2", a: "b", b: "a", type: "sync", rate: rate({ count: 14, per: "second", source: "measured", basis: "Load test." }) }])} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Alpha → Beta");
    expect(items[0]).toHaveTextContent("Illustrative, 6 a minute");
    expect(items[1]).toHaveTextContent("14 a second, measured. Load test.");
    expect(items[0]).toHaveAttribute("data-source", "illustrative");
  });

  it("shows nothing for a part whose connections have no rates", () => {
    const { container } = render(<TrafficPanel part={part([{ id: "e1", a: "a", b: "b", type: "sync" }])} />);
    expect(container.firstChild).toBeNull();
  });
});
