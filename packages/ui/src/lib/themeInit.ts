/** The key the theme is stored under in localStorage. */
export const THEME_STORAGE_KEY = "bp-theme";

/**
 * Applied before first paint by an inline script in the app's layout, so a dark-theme visitor never sees light first. Dark is the
 * design's own default; only an explicit "light" in storage turns it off. A plain module, so a Server Component can import it.
 */
export const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("${THEME_STORAGE_KEY}");
  if (t !== "light") document.documentElement.classList.add("dark");
} catch (e) {}
`;
