"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { ArchEdgeData, ArchEdgeRate, ArchPartData } from "./ArchitectureExplorer.types.js";

/**
 * Traffic on the connections: pulses that travel along a line in the direction of the request, as many as its rate says. The rate is
 * the part's own (`bullpen:rate` in its CALM moment), with where it comes from; a rate that is only illustrative says so everywhere
 * it is shown. Density is relative and on a log scale, not to scale: six pulses on a line are not six requests.
 */

const SECONDS: Record<ArchEdgeRate["per"], number> = { second: 1, minute: 60, hour: 3600, day: 86_400 };

/** Events a minute. */
export const perMinute = (rate: ArchEdgeRate): number => (rate.count * 60) / SECONDS[rate.per];

/** The most pulses a line carries, the longest a quiet line waits between its pulses, and the rates (events a minute, on a log scale) that mark the ends. */
const MAX_PULSES = 6;
const QUIET_PERIOD = 4.5;
const BUSY_LOG = Math.log10(600);
const QUIET_LOG = -2;

/** How busy a line is, from 0 (a few a day or fewer) to 1 (600 a minute or more), on a log scale: relative, not to scale. */
export function busyness(rate: ArchEdgeRate): number {
  const t = (Math.log10(Math.max(perMinute(rate), 1e-9)) - QUIET_LOG) / (BUSY_LOG - QUIET_LOG);
  return Math.min(1, Math.max(0, t));
}

/** How long a pulse takes to cross a line. */
export const TRAVEL_SECONDS = 2.2;

/**
 * How a line's pulses are timed. A busy line carries several, evenly spaced along it and repeating as each one arrives; a quiet line
 * carries one, with a long wait before the next, so it reads as occasional.
 */
export function pulseTiming(rate: ArchEdgeRate): { count: number; gap: number; period: number } {
  const count = 1 + Math.round((MAX_PULSES - 1) * busyness(rate));
  return count === 1 ? { count, gap: 0, period: QUIET_PERIOD } : { count, gap: TRAVEL_SECONDS / count, period: TRAVEL_SECONDS };
}

const UNIT: Record<ArchEdgeRate["per"], string> = { second: "s", minute: "min", hour: "hour", day: "day" };

/** "14 a second", "12 an hour", "1 a day": the rate in words. */
export function rateWords(rate: ArchEdgeRate): string {
  const article = rate.per === "hour" ? "an" : "a";
  return `${rate.count} ${article} ${rate.per}`;
}

/** The short form written on a line when nothing moves: "14/s", "12/hour", "1/day". */
export const rateShort = (rate: ArchEdgeRate): string => `${rate.count}/${UNIT[rate.per]}`;

/** What the rate is, with where it comes from, for the panel: an illustrative one says so first. */
export function rateText(rate: ArchEdgeRate): string {
  return rate.source === "illustrative" ? `Illustrative, ${rateWords(rate)}. ${rate.basis}` : `${rateWords(rate)}, ${rate.source}. ${rate.basis}`;
}

export interface EdgePulsesProps {
  /** The line's SVG path, from the source to the target: the direction of the request. */
  path: string;
  rate: ArchEdgeRate;
  /** How the pulses look and move: the colour (an owner's while the data toggle is on, else the ember), whether they are still, and whether this is the step being followed. */
  look: { color: string; still: boolean; onPath: boolean };
  edgeId: string;
}

/** The pulses of one line. They move by SMIL along the path, so they follow the line exactly, and they are absent when `still`. */
export function EdgePulses({ path, rate, look, edgeId }: EdgePulsesProps): ReactNode {
  const { color, still, onPath } = look;
  if (still) return null;
  const { count, gap, period } = pulseTiming(rate);
  const travel = TRAVEL_SECONDS / period;
  return (
    <g data-testid="edge-pulses" data-edge={edgeId} data-pulses={count} data-source={rate.source}>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} className="bp-arch-pulse" r={onPath ? 3.6 : 2.8} style={{ fill: color }}>
          <animateMotion dur={`${period}s`} begin={`${i * gap}s`} repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes={`0;${travel};1`} calcMode="linear" />
          <animate attributeName="opacity" dur={`${period}s`} begin={`${i * gap}s`} repeatCount="indefinite" values="0;1;1;0;0" keyTimes={`0;0.06;${Math.max(travel - 0.06, 0.07)};${travel};1`} />
        </circle>
      ))}
    </g>
  );
}

/** Whether a line carries pulses at all: it has a rate, and the part is built. */
export const carriesTraffic = (edge: ArchEdgeData, ghosted: boolean): boolean => edge.rate !== undefined && !ghosted;

/** Play and pause for the traffic. Reduced motion stops it for good, and the control says so instead of offering to start it. */
export function useTrafficPlayback(): { paused: boolean; toggle: () => void } {
  const [paused, setPaused] = useState(false);
  return { paused, toggle: () => setPaused((p) => !p) };
}

const controlStyle: CSSProperties = {
  border: 0,
  cursor: "pointer",
  borderRadius: "9999px",
  padding: "8px 14px",
  font: "600 12.5px/1 var(--font-body)",
  background: "var(--surface-sunken)",
  color: "var(--foreground)",
};

export interface TrafficControlProps {
  /** The part's connections: the control is there only when one of them has a rate. */
  edges: ArchEdgeData[];
  paused: boolean;
  reduced: boolean;
  onToggle: () => void;
}

export function TrafficControl({ edges, paused, reduced, onToggle }: TrafficControlProps): ReactNode {
  if (!edges.some((e) => e.rate)) return null;
  if (reduced) {
    return (
      <button type="button" disabled aria-label="Traffic is off: reduced motion" style={{ ...controlStyle, cursor: "not-allowed", color: "var(--foreground-muted)" }}>
        Traffic off · reduced motion
      </button>
    );
  }
  return (
    <button type="button" aria-pressed={paused} onClick={onToggle} style={controlStyle}>
      {paused ? "▶ Play traffic" : "❚❚ Pause traffic"}
    </button>
  );
}

/** Every connection of the part with its rate and where the rate comes from, so a figure that is only illustrative is marked as such. */
export function TrafficPanel({ part }: { part: ArchPartData }): ReactNode {
  const rated = part.edges.filter((e) => e.rate);
  if (rated.length === 0) return null;
  const label = (id: string): string => part.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <section aria-label="Traffic" style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px", font: "600 10.5px/1 var(--font-body)", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--foreground-muted)" }}>Traffic</h4>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {rated.map((e) => (
          <li key={e.id} data-edge={e.id} data-source={e.rate!.source} style={{ font: "500 12px/1.45 var(--font-body)" }}>
            <strong style={{ font: "600 12px/1.45 var(--font-body)" }}>
              {label(e.a)} → {label(e.b)}
            </strong>
            <span style={{ display: "block", color: "var(--foreground-muted)" }}>{rateText(e.rate!)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
