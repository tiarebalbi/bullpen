export interface AnalyticsConfig {
  /** GA4 measurement id (G-XXXXXXXXXX), or null when not configured. */
  googleId: string | null;
  /** Clarity project id, or null when not configured. */
  clarityId: string | null;
}

export interface AnalyticsEnv {
  VERCEL_ENV?: string | undefined;
  NEXT_PUBLIC_GA_MEASUREMENT_ID?: string | undefined;
  NEXT_PUBLIC_CLARITY_PROJECT_ID?: string | undefined;
}

// The ids end up in a script URL, so anything that is not plainly an id is treated as unset.
const GOOGLE_ID = /^G-[A-Za-z0-9]{4,20}$/;
const CLARITY_ID = /^[A-Za-z0-9]{4,32}$/;

function valid(value: string | undefined, pattern: RegExp): string | null {
  const trimmed = value?.trim();
  return trimmed && pattern.test(trimmed) ? trimmed : null;
}

/**
 * Whether a tag may ever load: only on the production deployment, and only
 * for a tool whose id is set. Previews and local development get null, so
 * they cannot send data whatever the visitor chose.
 */
export function resolveAnalyticsConfig(env: AnalyticsEnv): AnalyticsConfig | null {
  if (env.VERCEL_ENV !== "production") return null;
  const googleId = valid(env.NEXT_PUBLIC_GA_MEASUREMENT_ID, GOOGLE_ID);
  const clarityId = valid(env.NEXT_PUBLIC_CLARITY_PROJECT_ID, CLARITY_ID);
  if (!googleId && !clarityId) return null;
  return { googleId, clarityId };
}

interface TimelineShape {
  "current-moment"?: unknown;
  moments?: Array<{ "unique-id"?: unknown; metadata?: { kind?: unknown; after?: unknown } }>;
}

const partNumber = (named: unknown): number | null => {
  const match = typeof named === "string" ? /^part-(\d{2})$/.exec(named) : null;
  return match ? Number(match[1]) : null;
};

/**
 * The part of the series the timeline calls current ("part-02" -> 2), from the timeline as an object (a JSON import bundled at build time, or parsed text).
 * A bonus moment (ADR-0027) has no part number of its own: when it is the current moment, the part is the one it follows, named in its metadata (`after`),
 * because the next part is not out yet. This is for what is drawn; the analytics tag is `partTagFromTimeline`.
 */
export function currentPartOf(timeline: unknown): number | null {
  const t = (timeline ?? {}) as TimelineShape;
  const moment = t["current-moment"];
  const bonus = t.moments?.find((m) => m["unique-id"] === moment && m.metadata?.kind === "bonus");
  return partNumber(bonus ? bonus.metadata?.after : moment);
}

/** `currentPartOf` for the timeline's text. */
export function currentPartFromTimeline(timelineJson: string): number | null {
  try {
    return currentPartOf(JSON.parse(timelineJson));
  } catch {
    return null;
  }
}

/**
 * What the Clarity `part` tag says: the part number as text ("4"), or "bonus" while a bonus moment (ADR-0027) is the current one, so the bonus is told apart
 * from the part it follows instead of being counted as it. Null when the timeline does not say. A bonus is told by `metadata.kind`, never by its id.
 */
export function partTagFromTimeline(timeline: unknown): string | null {
  const t = (timeline ?? {}) as TimelineShape;
  const moment = t["current-moment"];
  if (t.moments?.some((m) => m["unique-id"] === moment && m.metadata?.kind === "bonus")) return "bonus";
  const part = partNumber(moment);
  return part === null ? null : String(part);
}
