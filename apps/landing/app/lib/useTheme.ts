"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "bp-theme";

export type Theme = "light" | "dark";

/**
 * Dark is the design's own default (Bullpen Landing.dc.html's script:
 * `state = { theme: 'dark', ... }`). layout.tsx's inline script applies the
 * persisted (or default dark) class to <html> synchronously, before this
 * component ever mounts -- so the initial state here is read from that
 * already-correct DOM class (guarded for SSR, where `document` doesn't
 * exist) rather than re-reading localStorage and setState-ing it inside an
 * effect, which would just be a redundant extra render
 * (react-hooks/set-state-in-effect exists precisely to flag that pattern).
 * <html suppressHydrationWarning> (layout.tsx) covers the resulting
 * server/client class mismatch for returning light-theme visitors.
 */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore -- the toggle still works for this render, just won't persist.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
