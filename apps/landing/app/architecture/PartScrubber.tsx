"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { ScrubberPart } from "../../lib/architecturePage.js";

/**
 * The moment scrubber every tab shares: one stop per part of the series,
 * labelled with its real title and whether it is built or planned. The
 * explorer's own scrubber is hidden on this page so there is only one.
 */
export function PartScrubber({
  parts,
  part,
  playing,
  onSelect,
  onTogglePlay,
}: {
  parts: ScrubberPart[];
  part: number;
  playing: boolean;
  onSelect: (part: number) => void;
  onTogglePlay: () => void;
}): ReactNode {
  const last = parts.length;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(Math.min(last, part + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSelect(Math.max(1, part - 1));
    }
  }

  return (
    <div className="bp-ap-scrub">
      <button type="button" className="bp-ap-scrub__play" aria-label={playing ? "Pause the series" : "Play the series"} onClick={onTogglePlay}>
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
      </button>
      <div role="group" aria-label="Series part" className="bp-ap-scrub__group" onKeyDown={onKeyDown}>
        <div className="bp-ap-scrub__track" aria-hidden="true">
          <div className="bp-ap-scrub__fill" style={{ transform: `scaleX(${last > 1 ? (part - 1) / (last - 1) : 0})` }} />
        </div>
        <ol className="bp-ap-scrub__stops">
          {parts.map((p) => (
            <li key={p.part}>
              <button
                type="button"
                className="bp-ap-scrub__stop"
                data-state={p.part === part ? "current" : p.part < part ? "past" : "future"}
                data-status={p.status}
                aria-current={p.part === part ? "step" : undefined}
                onClick={() => onSelect(p.part)}
              >
                <span className="bp-ap-scrub__dot" aria-hidden="true" />
                <span className="bp-ap-scrub__kicker">
                  PART {p.part} · {p.status === "built" ? "BUILT" : "PLANNED"}
                </span>
                <span className="bp-ap-scrub__title">{p.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
