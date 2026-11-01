"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { ScrubberPart } from "../../lib/architecturePage.js";

/** The bonus's stop on the scrubber: a short branch off the main line, between the part it follows and the next one. */
export interface BonusStop {
  /** The part it follows (4): the branch leaves the line half a step after it. */
  after: number;
  /** What the node is called: "Change request". */
  title: string;
  /** Built (published) or planned, as a part's node is. */
  status: "built" | "planned";
}

/** Where on the line a stop sits: a part at its number, the bonus half a step after the part it follows. */
export const BONUS_OFFSET = 0.5;

export type StopState = "current" | "past" | "future";

/** A stop's state against the selected position, whether a part or the bonus (`position` is a part number, or the bonus's place between two). */
export const stateAt = (place: number, position: number): StopState => (place === position ? "current" : place < position ? "past" : "future");

/** The stops in reading order, for the arrow keys: the parts, with the bonus after the part it follows. */
export function nextPosition(parts: number, position: number, bonus: BonusStop | undefined, direction: 1 | -1): number {
  const stops = [...Array.from({ length: parts }, (_, i) => i + 1), ...(bonus ? [bonus.after + BONUS_OFFSET] : [])].sort((a, b) => a - b);
  const at = stops.indexOf(position);
  return stops[Math.min(stops.length - 1, Math.max(0, at + direction))]!;
}

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
 * reached by Tab straight after that part and before the next. Its states are a part node's: built or planned, and current, past or future.
 */
function BonusNode({ bonus, state, onSelect }: { bonus: BonusStop; state: StopState; onSelect: () => void }): ReactNode {
  return (
    <button type="button" className="bp-ap-scrub__bonus" data-state={state} data-status={bonus.status} aria-current={state === "current" ? "step" : undefined} onClick={onSelect}>
      <span className="bp-ap-scrub__stub" aria-hidden="true" />
      <span className="bp-ap-scrub__diamond" aria-hidden="true" />
      <span className="bp-ap-scrub__kicker">BONUS · {bonus.status === "built" ? "BUILT" : "PLANNED"}</span>
      <span className="bp-ap-scrub__title">{bonus.title}</span>
    </button>
  );
}
