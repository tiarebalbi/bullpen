import { useEffect, useRef } from "react";

/** Calls `onMoved(from, to)` once for each change of `part`, whichever control caused it. */
export function useReportPartMoves(part: number, initialPart: number, onMoved: ((from: number, to: number) => void) | undefined): void {
  const reported = useRef(initialPart);
  useEffect(() => {
    if (reported.current === part) return;
    onMoved?.(reported.current, part);
    reported.current = part;
  }, [part, onMoved]);
}
