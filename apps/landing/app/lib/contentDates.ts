import type { SeriesPart } from "../../lib/series.js";

/** The day the privacy page's text last changed (YYYY-MM-DD). The page shows it and the sitemap's `lastmod` reads it. */
export const PRIVACY_UPDATED = "2026-10-01";

/** The date of the latest published part, or `null` while none is. Content dates only: never the build time. */
export function latestPublishedDate(parts: SeriesPart[]): string | null {
  const dates = parts.flatMap((part) => (part.status === "published" && part.date !== null ? [part.date] : []));
  return dates.length === 0 ? null : dates.reduce((a, b) => (a >= b ? a : b));
}

/** "2026-10-01" as "1 October 2026", read and shown in UTC so it is the same day wherever it is built. */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
