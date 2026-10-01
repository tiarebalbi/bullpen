import { useCallback, useEffect, useState } from "react";

export interface ControllablePartOptions {
  /** The part a parent controls, or undefined when the hook owns it. */
  controlledPart: number | undefined;
  onPartChange: ((part: number) => void) | undefined;
  initialPart: number;
  /** Shorter exit animation for people who asked for less motion. */
  reduced: boolean;
  /** How long a removed node gets to play its exit before the diagram settles on the new part. */
  exitMs: number;
  /**
   * Called during render, once, the first time a new part is shown. For
   * resetting whatever belongs to the part you left (a selection, a playback).
   */
  onArrive: (part: number) => void;
}

export interface ControllablePart {
  part: number;
  /** The part we came from. */
  prevPart: number;
  /** True while the previous part's removed nodes are still playing their exit. */
  settling: boolean;
  /** Ask for another part: through the parent when controlled, else ourselves. */
  requestPart: (next: number) => void;
}

/**
 * A part number that works the same whether the component owns it or a parent
 * does. "Which part did we come from" and "is the exit animation still
 * running" are derived from the current part, so neither needs an effect that
 * sets state. The render-time update is the documented way to derive state
 * from a changing value: React re-renders straight away, before anything is
 * painted.
 */
export function useControllablePart({ controlledPart, onPartChange, initialPart, reduced, exitMs, onArrive }: ControllablePartOptions): ControllablePart {
  const controlled = controlledPart !== undefined;
  const [internalPart, setInternalPart] = useState(initialPart);
  const part = controlledPart ?? internalPart;

  const [seen, setSeen] = useState({ part, prev: part });
  if (seen.part !== part) {
    setSeen({ part, prev: seen.part });
    onArrive(part);
  }

  const [settledPart, setSettledPart] = useState(part);
  useEffect(() => {
    if (settledPart === part) return;
    const timer = setTimeout(() => setSettledPart(part), reduced ? 420 : exitMs);
    return () => clearTimeout(timer);
  }, [part, settledPart, reduced, exitMs]);

  const requestPart = useCallback(
    (next: number) => {
      if (controlled) onPartChange?.(next);
      else setInternalPart(next);
    },
    [controlled, onPartChange],
  );

  return { part, prevPart: seen.prev, settling: settledPart !== part, requestPart };
}
