"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./themeInit.js";

export type Theme = "light" | "dark";

/** The theme the inline script already put on <html>; "dark" on the server, where there is no document. */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The theme and a toggle that keeps <html>'s class and the stored preference in step. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // The toggle still works for this visit; it just does not persist.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
