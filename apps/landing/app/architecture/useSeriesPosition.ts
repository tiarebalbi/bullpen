"use client";

import { useEffect, useState } from "react";
import type { ArchPartData } from "../components/ui.js";
import { latestBuiltPart } from "../components/ui.js";

const PLAY_MS = 2400;

export interface SeriesPosition {
  /** The selected part. While the bonus is selected it is the part the bonus follows. */
  part: number;
  bonusSelected: boolean;
  /** Playback is running (it stops by itself at the last part). */
  running: boolean;
  select: (part: number) => void;
  selectBonus: () => void;
  togglePlay: () => void;
}

/**
 * Where the reader is on the series: a part, or the bonus between two of them, and whether the series is playing. One hook for the architecture page and the
 * home page's explorer, so both scrubbers select, step and play the same way. Opens on the latest built part, read from the explorer content.
 */
export function useSeriesPosition(parts: ArchPartData[], bonus: ArchPartData | null): SeriesPosition {
  const last = parts.length;
  const [part, setPart] = useState(latestBuiltPart(parts));
  const [playing, setPlaying] = useState(false);
  const [bonusSelected, setBonusSelected] = useState(false);
  // Playback stops by itself at the last part without an effect that sets state.
  const running = playing && part < last;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setPart((p) => Math.min(p + 1, last)), PLAY_MS);
    return () => clearInterval(id);
  }, [running, last]);

  return {
    part,
    bonusSelected: bonus !== null && bonusSelected,
    running,
    select: (next) => {
      setPlaying(false);
      setBonusSelected(false);
      setPart(next);
    },
    selectBonus: () => {
      if (!bonus) return;
      setPlaying(false);
      setPart(bonus.part);
      setBonusSelected(true);
    },
    togglePlay: () => {
      if (running) setPlaying(false);
      else {
        if (part >= last) setPart(1);
        setBonusSelected(false);
        setPlaying(true);
      }
    },
  };
}
