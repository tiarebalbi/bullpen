"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { FlowView } from "../../lib/architecturePage.js";
import { Chip } from "../components/ui.js";

const STEP_MS = 1700;

type Lanes = Map<string, number>;

function StepList({ flow, lanes, index, onGo }: { flow: FlowView; lanes: Lanes; index: number; onGo: (i: number) => void }): ReactNode {
  const label = (id: string): string | undefined => flow.lanes[lanes.get(id) ?? 0]?.label;
  return (
    <ol className="bp-ap-steps" aria-label="Steps">
      {flow.steps.map((step, i) => (
        <li key={step.n}>
          <button type="button" className="bp-ap-step" aria-current={i === index ? "step" : undefined} onClick={() => onGo(i)}>
            <span className="bp-ap-step__n">{step.n}</span>
            <span className="bp-ap-step__body">
              <span className="bp-ap-step__caption">{step.caption}</span>
              <span className="bp-ap-step__meta">
                {step.mode === "sync" ? "SYNC · waits" : "ASYNC · queued"} · {label(step.from)} → {label(step.to)}
              </span>
              <span className="bp-ap-step__detail">{step.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** One row of the sequence: a labelled arrow across the lanes between caller and callee. */
function SequenceRow({ step, lanes, state }: { step: FlowView["steps"][number]; lanes: Lanes; state: "past" | "current" | "future" }): ReactNode {
  const from = lanes.get(step.from) ?? 0;
  const to = lanes.get(step.to) ?? 0;
  return (
    <div className="bp-ap-seq__row" data-state={state} style={{ gridColumn: `${Math.min(from, to) + 1} / ${Math.max(from, to) + 2}` }}>
      <span className="bp-ap-seq__caption">
        {step.n} {step.caption}
      </span>
      <span className="bp-ap-seq__line" data-mode={step.mode} data-direction={to >= from ? "right" : "left"} />
    </div>
  );
}

function Sequence({ flow, lanes, index }: { flow: FlowView; lanes: Lanes; index: number }): ReactNode {
  const syncCount = flow.steps.filter((s) => s.mode === "sync").length;
  return (
    <div className="bp-ap-seq" style={{ ["--lanes" as string]: flow.lanes.length }}>
      <div className="bp-ap-seq__legend">
        <span>
          <i className="bp-ap-seq__swatch" /> Sync: the caller waits
        </span>
        <span>
          <i className="bp-ap-seq__swatch bp-ap-seq__swatch--async" /> Async: queued, no waiting
        </span>
        <span className="bp-ap-seq__count">
          {flow.steps.length} steps · {syncCount} sync · {flow.steps.length - syncCount} async
        </span>
      </div>
      <div className="bp-ap-seq__scroll">
        <div className="bp-ap-seq__canvas">
          <div className="bp-ap-seq__lanes">
            {flow.lanes.map((lane) => (
              <div key={lane.id} className="bp-ap-seq__lane">
                <span className="bp-ap-seq__lane-meta">{lane.meta}</span>
                <span>{lane.label}</span>
              </div>
            ))}
          </div>
          <div className="bp-ap-seq__rows">
            {flow.steps.map((step, i) => (
              <SequenceRow key={step.n} step={step} lanes={lanes} state={i === index ? "current" : i < index ? "past" : "future"} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Playback({
  index,
  last,
  running,
  caption,
  onGo,
  onToggle,
}: {
  index: number;
  last: number;
  running: boolean;
  caption: string;
  onGo: (i: number) => void;
  onToggle: () => void;
}): ReactNode {
  return (
    <div className="bp-ap-playback" role="group" aria-label="Playback">
      <button type="button" onClick={() => onGo(index - 1)} aria-label="Previous step" disabled={index === 0}>
        ◀
      </button>
      <button type="button" aria-label={running ? "Pause playback" : "Play the flow"} onClick={onToggle}>
        {running ? "❚❚" : "▶"}
      </button>
      <button type="button" onClick={() => onGo(index + 1)} aria-label="Next step" disabled={index === last}>
        ▶
      </button>
      <span className="bp-ap-playback__count">
        STEP {index + 1} OF {last + 1}
      </span>
      <span className="bp-ap-playback__now" aria-live="polite">
        {caption}
      </span>
    </div>
  );
}

/**
 * One real flow per part: the request the explorer follows, drawn as a
 * sequence. Sync arrows are solid (the caller waits); async arrows are
 * dashed. Mount it with `key={part}` so a new part starts from step one.
 */
export function FlowsTab({ part, flow }: { part: number; flow: FlowView }): ReactNode {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = flow.steps.length - 1;
  const running = playing && index < last;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIndex((i) => Math.min(i + 1, last)), STEP_MS);
    return () => clearInterval(id);
  }, [running, last]);

  const lanes: Lanes = new Map(flow.lanes.map((lane, i) => [lane.id, i]));
  const go = (next: number): void => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, next)));
  };
  const toggle = (): void => {
    if (running) setPlaying(false);
    else {
      if (index >= last) setIndex(0);
      setPlaying(true);
    }
  };

  return (
    <section aria-labelledby="bp-ap-flows-h">
      <div className="bp-ap-tabhead">
        <div>
          <div className="bp-eyebrow">Flows · Part {part}</div>
          <h2 id="bp-ap-flows-h">Follow {flow.name}</h2>
        </div>
        <p className="bp-ap-tabhead__help">
          {flow.planned ? "A prediction, not something that runs yet. " : ""}
          Who calls whom, in order, and whether the caller waits.
        </p>
      </div>
      {flow.planned ? (
        <p>
          <Chip tone="outline">Preview · planned</Chip>
        </p>
      ) : null}

      <div className="bp-ap-flow">
        <StepList flow={flow} lanes={lanes} index={index} onGo={go} />
        <Sequence flow={flow} lanes={lanes} index={index} />
      </div>

      <Playback index={index} last={last} running={running} caption={flow.steps[index]?.caption ?? ""} onGo={go} onToggle={toggle} />
    </section>
  );
}
