import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Mirrors the check `Bullpen Landing.dc.html` runs in
 * `componentDidMount`:
 *
 *   if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
 *     this.setState({ reduced: true });
 *
 * ...but also subscribes to changes, since a component can outlive a
 * user toggling the OS setting mid-session.
 *
 * Starts `false` rather than reading matchMedia synchronously: this is
 * a "use client" component that a server-rendered app can hydrate, and
 * reading the real value only in the effect (client-only, post-mount)
 * keeps the first client render identical to the server-rendered
 * markup — no hydration mismatch for a reduced-motion visitor.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(QUERY);
    const onChange = (): void => setReduced(mql.matches);
    onChange();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    // Safari < 14 fallback API.
    type LegacyMediaQueryList = MediaQueryList & {
      addListener(listener: (event: MediaQueryListEvent) => void): void;
      removeListener(listener: (event: MediaQueryListEvent) => void): void;
    };
    const legacy = mql as LegacyMediaQueryList;
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, []);

  return reduced;
}
