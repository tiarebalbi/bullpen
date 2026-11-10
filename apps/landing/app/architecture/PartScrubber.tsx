"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { ScrubberPart } from "../../lib/architecturePage.js";
import { BONUS_OFFSET, nextPosition, stateAt, type BonusStop, type StopState } from "./seriesStops.js";

/** The scrubber's name for the bonus's node. */
export const BONUS_NODE_TITLE = "Change request";

export { BONUS_OFFSET, nextPosition, stateAt, type BonusStop, type StopState };

/**
 * The moment scrubber every tab shares: one stop per part of the series,
 * labelled with its real title and whether it is built or planned, and, when
 * there is a bonus, a diamond on a short branch between the two parts it sits
 * between. The explorer's own scrubber is hidden on this page so there is only one.
 */
export function PartScrubber({
  parts,
  part,
  bonus,
  bonusSelected = false,
  playing,
  onSelect,
  onSelectBonus,
  onTogglePlay,
}: {
  parts: ScrubberPart[];
  part: number;
  bonus?: BonusStop;
  bonusSelected?: boolean;
  playing: boolean;
  onSelect: (part: number) => void;
  onSelectBonus?: () => void;
  onTogglePlay: () => void;
}): ReactNode {
  const last = parts.length;
  const position = bonusSelected && bonus ? bonus.after + BONUS_OFFSET : part;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const next = nextPosition(last, position, bonus, direction);
    if (bonus && next === bonus.after + BONUS_OFFSET) onSelectBonus?.();
    else onSelect(next);
  }

  return (
    <div className="bp-ap-scrub" data-has-bonus={bonus ? "true" : undefined}>
      <button type="button" className="bp-ap-scrub__play" aria-label={playing ? "Pause the series" : "Play the series"} onClick={onTogglePlay}>
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
      </button>
      <div role="group" aria-label="Series part" className="bp-ap-scrub__group" onKeyDown={onKeyDown}>
        <div className="bp-ap-scrub__track" aria-hidden="true">
          <div className="bp-ap-scrub__fill" style={{ transform: `scaleX(${last > 1 ? (position - 1) / (last - 1) : 0})` }} />
        </div>
        <ol className="bp-ap-scrub__stops">
          {parts.map((p) => (
            <li key={p.part}>
              <button
                type="button"
                className="bp-ap-scrub__stop"
                data-state={stateAt(p.part, position)}
                data-status={p.status}
                aria-current={p.part === position ? "step" : undefined}
                onClick={() => onSelect(p.part)}
              >
                <span className="bp-ap-scrub__dot" aria-hidden="true" />
                <span className="bp-ap-scrub__kicker">
                  PART {p.part} · {p.status === "built" ? "BUILT" : "PLANNED"}
                </span>
                <span className="bp-ap-scrub__title">{p.title}</span>
              </button>
              {bonus && bonus.after === p.part ? (
                <BonusNode bonus={bonus} state={stateAt(bonus.after + BONUS_OFFSET, position)} onSelect={() => onSelectBonus?.()} />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * The bonus's node, hung from the main line by a short stub: a diamond, "BONUS" and its title. It sits in the list item of the part it follows, so it is
 * reached by Tab straight after that part and before the next. Its states are a part node's: built or planned, and current, past or future. Once it is selected or
 * passed (`data-reached`) its branch is drawn in the accent, as the main line is up to the part it follows.
 */
function BonusNode({ bonus, state, onSelect }: { bonus: BonusStop; state: StopState; onSelect: () => void }): ReactNode {
  return (
    <button
      type="button"
      className="bp-ap-scrub__bonus"
      data-state={state}
      data-status={bonus.status}
      data-reached={state !== "future" ? "true" : undefined}
      aria-current={state === "current" ? "step" : undefined}
      onClick={onSelect}
    >
      <span className="bp-ap-scrub__stub" aria-hidden="true" />
      <span className="bp-ap-scrub__diamond" aria-hidden="true" />
      <span className="bp-ap-scrub__kicker">BONUS · {bonus.status === "built" ? "BUILT" : "PLANNED"}</span>
      <span className="bp-ap-scrub__title">{bonus.title}</span>
    </button>
  );
}
