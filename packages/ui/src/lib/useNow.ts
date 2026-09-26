import { useEffect, useState } from "react";

/**
 * `Date.now()`, refreshed once a second — unless `fixed` is supplied,
 * in which case that value is returned as-is and nothing self-updates.
 * Lets PriceCell re-check staleness on its own in real usage, while
 * tests can pin `now` for deterministic assertions.
 */
export function useNow(fixed?: number): number {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (fixed !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fixed]);

  return fixed ?? tick;
}
