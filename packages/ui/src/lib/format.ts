/**
 * Formatting helpers ported from design/export-2026-09-25/bullpen.js
 * (the same module the Landing page imports at runtime), so the
 * ported components sign and format numbers exactly like the export.
 */

/** True Unicode minus sign (U+2212) — never a hyphen-minus (U+002D). */
export const MINUS = "−";

/** `1234.5` -> `"1,234.50"`, matching `fmt()` in bullpen.js. */
export function fmt(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Signed magnitude string: `+` for positive, U+2212 for negative,
 * nothing for exactly zero. Matches `signed()` in bullpen.js.
 */
export function signed(value: number, decimals = 2, prefix = "", suffix = ""): string {
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return sign + prefix + fmt(Math.abs(value), decimals) + suffix;
}

/** `"BTC-USD"` -> `"BTC"`. Matches `mono()` in bullpen.js. */
export function mono(symbol: string): string {
  return symbol.replace("-USD", "");
}

/** Quiet hue tint used for TickerBadge/PriceCell backgrounds — scanning cue, never meaning. */
export function badgeBg(hue: number): string {
  return `color-mix(in oklch, var(--surface-elevated) 80%, oklch(66% 0.12 ${hue}))`;
}

/**
 * `HH:MM:SS` in the viewer's local time — matching the design's own
 * "as of 14:02:11" (no zone shown, unlike "Close · 16:00 ET" which
 * names one explicitly). `hourCycle: "h23"` avoids `hour12: false`,
 * which some engines still render as "24:05:00" for midnight.
 */
export function formatTime(epochMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(epochMs));
}
