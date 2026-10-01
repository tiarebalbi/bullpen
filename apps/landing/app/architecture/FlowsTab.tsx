"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { FlowView } from "../../lib/architecturePage.js";
import { Chip } from "../components/ui.js";

const STEP_MS = 1700;

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

  const laneIndex = new Map(flow.lanes.map((lane, i) => [lane.id, i]));
  const go = (next: number): void => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, next)));
  };
  const syncCount = flow.steps.filter((s) => s.mode === "sync").length;
  const current = flow.steps[index];

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
        <ol className="bp-ap-steps" aria-label="Steps">
          {flow.steps.map((step, i) => (
            <li key={step.n}>
              <button type="button" className="bp-ap-step" aria-current={i === index ? "step" : undefined} onClick={() => go(i)}>
                <span className="bp-ap-step__n">{step.n}</span>
                <span className="bp-ap-step__body">
                  <span className="bp-ap-step__caption">{step.caption}</span>
                  <span className="bp-ap-step__meta">
                    {step.mode === "sync" ? "SYNC · waits" : "ASYNC · queued"} · {flow.lanes[laneIndex.get(step.from) ?? 0]?.label} → {flow.lanes[laneIndex.get(step.to) ?? 0]?.label}
                  </span>
                  <span className="bp-ap-step__detail">{step.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

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
                {flow.steps.map((step, i) => {
                  const from = laneIndex.get(step.from) ?? 0;
                  const to = laneIndex.get(step.to) ?? 0;
                  const lo = Math.min(from, to);
                  const hi = Math.max(from, to);
                  return (
                    <div
                      key={step.n}
                      className="bp-ap-seq__row"
                      data-state={i === index ? "current" : i < index ? "past" : "future"}
                      style={{ gridColumn: `${lo + 1} / ${hi + 2}` }}
                    >
                      <span className="bp-ap-seq__caption">
                        {step.n} {step.caption}
                      </span>
                      <span className="bp-ap-seq__line" data-mode={step.mode} data-direction={to >= from ? "right" : "left"} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bp-ap-playback" role="group" aria-label="Playback">
        <button type="button" onClick={() => go(index - 1)} aria-label="Previous step" disabled={index === 0}>
          ◀
        </button>
        <button
          type="button"
          aria-label={running ? "Pause playback" : "Play the flow"}
          onClick={() => {
            if (running) setPlaying(false);
            else {
              if (index >= last) setIndex(0);
              setPlaying(true);
            }
          }}
        >
          {running ? "❚❚" : "▶"}
        </button>
        <button type="button" onClick={() => go(index + 1)} aria-label="Next step" disabled={index === last}>
          ▶
        </button>
        <span className="bp-ap-playback__count">
          STEP {index + 1} OF {flow.steps.length}
        </span>
        <span className="bp-ap-playback__now" aria-live="polite">
          {current ? current.caption : ""}
        </span>
      </div>
    </section>
  );
}
