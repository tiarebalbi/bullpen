"use client";

import { useEffect, useState } from "react";
import type { ArchPartData } from "../components/ui.js";
import { BONUS_OFFSET, nextPosition, openingPosition } from "./seriesStops.js";

/** How long Play stays on a stop, a part or the bonus alike. */
export const PLAY_MS = 2400;

export interface SeriesPosition {
  /** The selected part. While the bonus is selected it is the part the bonus follows. */
  part: number;
  bonusSelected: boolean;
  /** Playback is running (it stops by itself at the last stop). */
  running: boolean;
  select: (part: number) => void;
  selectBonus: () => void;
  togglePlay: () => void;
}

/**
 * Where the reader is on the series: a part, or the bonus between two of them, and whether the series is playing. One hook for the architecture page and the
 * home page's explorer, so both scrubbers open, select, step and play the same way. It opens on the bonus when `opensOnBonus` (the timeline's current moment is the
 * built bonus, from `lib/currentMoment`), and otherwise on the latest built part, read from the explorer content. Play steps through the stops in reading order,
 * the bonus between the part it follows and the next, one stop every `PLAY_MS`.
 */
export function useSeriesPosition(parts: ArchPartData[], bonus: ArchPartData | null, opensOnBonus = false): SeriesPosition {
  const last = parts.length;
  // The part the bonus follows (4), or null without a bonus; the bonus's own place on the line is half a step after it.
  const after = bonus ? bonus.part : null;
  const bonusAt = after === null ? null : after + BONUS_OFFSET;
  const lastStop = Math.max(last, bonusAt ?? 0);
  // One number is the position: a part's number, or the bonus half a step after the part it follows.
  const [position, setPosition] = useState(() => openingPosition(parts, bonus, opensOnBonus));
  const [playing, setPlaying] = useState(false);
  // Playback stops by itself at the last stop without an effect that sets state.
  const running = playing && position < lastStop;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setPosition((p) => nextPosition(last, p, after === null ? undefined : { after }, 1)), PLAY_MS);
    return () => clearInterval(id);
  }, [running, last, after]);

  return {
    part: Math.floor(position),
    bonusSelected: bonusAt !== null && position === bonusAt,
    running,
    select: (next) => {
      setPlaying(false);
      setPosition(next);
    },
    selectBonus: () => {
      if (bonusAt === null) return;
      setPlaying(false);
      setPosition(bonusAt);
    },
    togglePlay: () => {
      if (running) setPlaying(false);
      else {
        if (position >= lastStop) setPosition(1);
        setPlaying(true);
      }
    },
  };
}
