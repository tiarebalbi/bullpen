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

/**
 * The part of the series the timeline calls current ("part-02" -> 2), for the
 * Clarity `part` tag. Takes the timeline's text, so each app reads the file
 * itself and this stays free of node:fs.
 */
export function currentPartFromTimeline(timelineJson: string): number | null {
  try {
    const moment = (JSON.parse(timelineJson) as { "current-moment"?: unknown })["current-moment"];
    const match = typeof moment === "string" ? /^part-(\d{2})$/.exec(moment) : null;
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}
